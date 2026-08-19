import test from 'node:test';
import assert from 'node:assert/strict';

import { getSessions, saveSession } from './sessionStore.js';
import { reconcileAllSessions } from './apiClient.js';

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

const LAP = {
  id: 'lap-1',
  startTime: '2026-05-02T10:00:00.000Z',
  endTime: '2026-05-02T10:10:00.000Z',
  current_hours: 0,
  current_minutes: 10,
  current_seconds: 0,
  workDoneString: 'Work',
  HourlyAmount: 60,
};

/** Stub the backend. `detail` is what GET /sessions/{uuid} returns. */
function installFetch(detail, calls = []) {
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace('https://just-like-clockwork-backend.krishnarajthadesar.in/api', '');
    calls.push(`${method} ${path}`);

    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

    if (method === 'GET' && path.startsWith('/sessions/?')) return json([]);
    if (method === 'POST' && path === '/sessions/') return json({ id: 1, sessionUuid: 'session-1' });
    if (method === 'POST' && path === '/sessions/1/laps') return json({ id: 10 });
    if (method === 'PUT' && path === '/sessions/1') return json({ id: 1 });
    if (method === 'GET' && path === '/sessions/session-1') return json(detail);
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  };
  return calls;
}

test('a verified upload removes the local copy', async () => {
  installLocalStorage();
  saveSession([LAP], { id: 'session-1', createdAt: '2026-05-02T10:00:00.000Z' });
  assert.equal(getSessions().length, 1);

  installFetch({ id: 1, sessionUuid: 'session-1', totalSeconds: 600, laps: [{ id: 10 }] });

  const summary = await reconcileAllSessions();

  assert.equal(summary.uploaded, 1);
  assert.equal(summary.verified, 1);
  assert.equal(summary.keptLocally, 0);
  assert.deepEqual(summary.problems, []);
  assert.equal(getSessions().length, 0, 'local copy should be gone once the server copy matches');
});

test('a lap-count mismatch keeps the local copy', async () => {
  installLocalStorage();
  saveSession([LAP], { id: 'session-1', createdAt: '2026-05-02T10:00:00.000Z' });

  // Server accepted the write but stored no laps.
  installFetch({ id: 1, sessionUuid: 'session-1', totalSeconds: 600, laps: [] });

  const summary = await reconcileAllSessions();

  assert.equal(summary.verified, 0);
  assert.equal(summary.keptLocally, 1);
  assert.match(summary.problems[0], /did not match the cloud copy \(server has 0 laps, local has 1\)/);
  assert.equal(getSessions().length, 1, 'local copy must survive a failed verification');
});

test('a totals mismatch keeps the local copy', async () => {
  installLocalStorage();
  saveSession([LAP], { id: 'session-1', createdAt: '2026-05-02T10:00:00.000Z' });

  // Right lap count, wrong duration — the stale-rollup bug's signature.
  installFetch({ id: 1, sessionUuid: 'session-1', totalSeconds: 5000, laps: [{ id: 10 }] });

  const summary = await reconcileAllSessions();

  assert.equal(summary.verified, 0);
  assert.equal(summary.keptLocally, 1);
  assert.match(summary.problems[0], /server total 5000s, local total 600s/);
  assert.equal(getSessions().length, 1);
});

test('an unreadable session list deletes nothing', async () => {
  installLocalStorage();
  saveSession([LAP], { id: 'session-1', createdAt: '2026-05-02T10:00:00.000Z' });

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' });

  const summary = await reconcileAllSessions();

  assert.equal(summary.verified, 0);
  assert.match(summary.problems[0], /Could not list cloud sessions/);
  assert.equal(getSessions().length, 1);
});

test('a session already on the server is verified without re-uploading', async () => {
  installLocalStorage();
  saveSession([LAP], { id: 'session-1', createdAt: '2026-05-02T10:00:00.000Z' });

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace('https://just-like-clockwork-backend.krishnarajthadesar.in/api', '');
    calls.push(`${method} ${path}`);
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
    if (method === 'GET' && path.startsWith('/sessions/?')) {
      return json([{ id: 1, sessionUuid: 'session-1' }]);
    }
    if (method === 'GET' && path === '/sessions/session-1') {
      return json({ id: 1, sessionUuid: 'session-1', totalSeconds: 600, laps: [{ id: 10 }] });
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };

  const summary = await reconcileAllSessions();

  assert.equal(summary.uploaded, 0, 'should not re-upload something the server already has');
  assert.equal(summary.verified, 1);
  assert.equal(getSessions().length, 0);
  assert.ok(!calls.some((c) => c.startsWith('POST')), `no POSTs expected, got ${calls.join(', ')}`);
});
