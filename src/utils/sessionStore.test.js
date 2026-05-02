import test from 'node:test';
import assert from 'node:assert/strict';

import { getSessions, saveSession, updateSession } from './sessionStore.js';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

test('saveSession can reuse a live session UUID for cloud identity', () => {
  installLocalStorage();
  const sessionId = saveSession([{
    id: 'lap-1',
    startTime: '2026-05-02T10:00:00Z',
    endTime: '2026-05-02T10:10:00Z',
    current_hours: 0,
    current_minutes: 10,
    current_seconds: 0,
    workDoneString: 'Work',
    HourlyAmount: 60,
  }], { id: 'session-live-1', createdAt: '2026-05-02T10:00:00Z' });

  const sessions = getSessions();
  assert.equal(sessionId, 'session-live-1');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionUuid, 'session-live-1');
  assert.equal(sessions[0].lapCount, 1);
  assert.equal(sessions[0].totalSeconds, 600);
  assert.equal(sessions[0].totalAmount, 10);
  assert.match(sessions[0].sessionName, /^Session .*\d{2}:\d{2}/);
});

test('updateSession persists local name edits', () => {
  installLocalStorage();
  saveSession([], { id: 'session-1', createdAt: '2026-05-02T10:00:00Z' });

  updateSession('session-1', { sessionName: 'Edited locally' });

  assert.equal(getSessions()[0].sessionName, 'Edited locally');
});
