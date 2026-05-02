import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeLocalAndBackendSessions, normalizeBackendSession } from './sessionMerge.js';

test('normalizeBackendSession preserves cloud identity and rollups', () => {
  const normalized = normalizeBackendSession({
    id: 42,
    sessionUuid: 'local-session-1',
    sessionName: 'Cloud name',
    startedAt: '2026-05-02T10:00:00Z',
    lapCount: 2,
    totalDuration: 900,
    totalAmount: 30,
  });

  assert.equal(normalized.id, 'local-session-1');
  assert.equal(normalized._backendId, 42);
  assert.equal(normalized.lapCount, 2);
  assert.equal(normalized.totalSeconds, 900);
  assert.equal(normalized._source, 'backend');
});

test('mergeLocalAndBackendSessions merges by UUID instead of fuzzy timestamps', () => {
  const local = [{
    id: 'local-session-1',
    sessionUuid: 'local-session-1',
    sessionName: 'Local name',
    createdAt: '2026-05-02T10:00:01Z',
    startTime: '2026-05-02T10:00:01Z',
    lapCount: 1,
    totalSeconds: 600,
    totalAmount: 20,
    laps: [{ id: 'lap-1' }],
  }];
  const backend = [{
    id: 7,
    sessionUuid: 'local-session-1',
    sessionName: 'Cloud name',
    startedAt: '2026-05-02T10:00:00Z',
    lapCount: 1,
    totalDuration: 600,
  }];

  const merged = mergeLocalAndBackendSessions(local, backend, []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'local-session-1');
  assert.equal(merged[0]._source, 'synced');
  assert.equal(merged[0]._localId, 'local-session-1');
  assert.equal(merged[0]._backendId, 7);
  assert.equal(merged[0].sessionName, 'Cloud name');
  assert.deepEqual(merged[0].laps, [{ id: 'lap-1' }]);
});

test('mergeLocalAndBackendSessions keeps cloud-only sessions visible on another browser', () => {
  const merged = mergeLocalAndBackendSessions([], [{
    id: 8,
    sessionUuid: 'cloud-session-1',
    startedAt: '2026-05-02T12:00:00Z',
    lapCount: 3,
    totalDuration: 1800,
  }], []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'cloud-session-1');
  assert.equal(merged[0]._source, 'backend');
  assert.equal(merged[0]._backendId, 8);
  assert.equal(merged[0].lapCount, 3);
});
