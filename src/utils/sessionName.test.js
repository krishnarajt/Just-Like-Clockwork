import test from 'node:test';
import assert from 'node:assert/strict';

import { getSessions, saveSession, getDefaultSessionName } from './sessionStore.js';
import { normalizeBackendSession } from './sessionMerge.js';
import { syncSessionToBackend } from './apiClient.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  localStorage.setItem('jlc_access_token', 'access');
  localStorage.setItem('jlc_refresh_token', 'refresh');
  localStorage.setItem('jlc_token_expiry', String(Date.now() + 60 * 60 * 1000));
}

// Laps are stored newest-first, so the session started at the LAST lap's start.
const SESSION_START = '2026-05-02T10:00:00.000Z';
const LAPS = [
  {
    id: 'lap-2',
    startTime: '2026-05-02T10:10:00.000Z',
    endTime: '2026-05-02T10:20:00.000Z',
    current_hours: 0, current_minutes: 10, current_seconds: 0,
    workDoneString: 'later work', HourlyAmount: 60,
  },
  {
    id: 'lap-1',
    startTime: SESSION_START,
    endTime: '2026-05-02T10:10:00.000Z',
    current_hours: 0, current_minutes: 10, current_seconds: 0,
    workDoneString: 'first work', HourlyAmount: 60,
  },
];

test('a saved session is named after its start, not the moment it was saved', () => {
  installLocalStorage();
  // No createdAt passed, exactly as ControlButtons does on stop, so createdAt
  // defaults to "now" while the session actually began back in May.
  saveSession(LAPS, { id: 'session-1' });

  const [stored] = getSessions();
  assert.equal(stored.sessionName, getDefaultSessionName(SESSION_START));
  assert.equal(stored.startTime, SESSION_START);
  assert.notEqual(
    stored.sessionName,
    getDefaultSessionName(stored.createdAt),
    'naming from createdAt is what made the local and cloud names differ',
  );
});

test('the name uploaded to the backend is the local name, unchanged', async () => {
  installLocalStorage();
  saveSession(LAPS, { id: 'session-1' });
  const [stored] = getSessions();

  const bodies = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace('https://just-like-clockwork-backend.krishnarajthadesar.in/api', '');
    if (options.body) bodies.push({ method, path, body: JSON.parse(options.body) });
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
    if (method === 'POST' && path === '/sessions/') return json({ id: 7, sessionUuid: 'session-1' });
    if (method === 'POST' && path === '/sessions/7/laps') return json({ id: 70 });
    if (method === 'PUT' && path === '/sessions/7') return json({ id: 7 });
    return json({});
  };

  const backendId = await syncSessionToBackend(stored);
  assert.equal(backendId, 7);

  const created = bodies.find((b) => b.method === 'POST' && b.path === '/sessions/');
  assert.equal(created.body.sessionName, stored.sessionName);
  assert.equal(created.body.startedAt, SESSION_START, 'startedAt must be the session start too');

  // Every later write must carry the same name, so it cannot drift mid-session.
  bodies
    .filter((b) => b.method === 'PUT' && 'sessionName' in b.body)
    .forEach((b) => assert.equal(b.body.sessionName, stored.sessionName));
});

test('a backend session with no stored name reads the same as the local copy', () => {
  installLocalStorage();
  saveSession(LAPS, { id: 'session-1' });
  const [stored] = getSessions();

  const fromBackend = normalizeBackendSession({
    id: 7,
    sessionUuid: 'session-1',
    sessionName: null,
    startedAt: SESSION_START,
    lapCount: 2,
    totalSeconds: 1200,
    totalAmount: 20,
    isCompleted: true,
  });

  assert.equal(fromBackend.sessionName, stored.sessionName);
});

test('periodic in-progress syncs never rewrite the description', async () => {
  installLocalStorage();
  const { syncCurrentSessionToBackend, setLiveBackendSessionId } = await import('./apiClient.js');
  setLiveBackendSessionId('7');

  const bodies = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    if (options.body) bodies.push({ method, body: JSON.parse(options.body) });
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
    if (String(url).endsWith('/laps')) return json({ id: 70 });
    return json({ id: 7 });
  };

  await syncCurrentSessionToBackend(LAPS, {});

  const puts = bodies.filter((b) => b.method === 'PUT');
  assert.ok(puts.length > 0, 'expected a finalising PUT');
  puts.forEach((b) =>
    assert.ok(!('description' in b.body), `PUT should not touch description, got ${JSON.stringify(b.body)}`),
  );
});
