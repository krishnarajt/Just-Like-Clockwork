import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, formatLocalDateTime, parseTimestamp } from './timeFormat.js';

test('parseTimestamp handles backend datetime strings with microseconds', () => {
  const parsed = parseTimestamp('2026-05-02 10:20:30.123456+00:00');
  assert.equal(parsed.toISOString(), '2026-05-02T10:20:30.123Z');
});

test('formatLocalDateTime hides backend microseconds and timezone suffixes', () => {
  const formatted = formatLocalDateTime('2026-05-02 10:20:30.123456+00:00');
  assert.doesNotMatch(formatted, /123456|\+00:00|Z$/);
  assert.match(formatted, /\d{2}:\d{2}/);
});

test('formatDuration renders whole elapsed seconds', () => {
  assert.equal(formatDuration(3661), '1h 1m 1s');
  assert.equal(formatDuration('bad'), '0h 0m 0s');
});
