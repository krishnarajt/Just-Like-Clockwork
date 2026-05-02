import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elapsedSecondsFromWallClock,
  partsFromSeconds,
  secondsFromParts,
} from './timerMath.js';

test('secondsFromParts converts display parts into whole seconds', () => {
  assert.equal(secondsFromParts(1, 2, 3), 3723);
  assert.equal(secondsFromParts('2', '3', '4'), 7384);
});

test('secondsFromParts clamps invalid and negative totals to zero', () => {
  assert.equal(secondsFromParts(Number.NaN, undefined, 'nope'), 0);
  assert.equal(secondsFromParts(-1, 0, 0), 0);
});

test('partsFromSeconds converts elapsed seconds into display parts', () => {
  assert.deepEqual(partsFromSeconds(3661), { hours: 1, minutes: 1, seconds: 1 });
  assert.deepEqual(partsFromSeconds('7325.9'), { hours: 2, minutes: 2, seconds: 5 });
});

test('partsFromSeconds clamps invalid and negative totals to zero', () => {
  assert.deepEqual(partsFromSeconds(-5), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(partsFromSeconds('wat'), { hours: 0, minutes: 0, seconds: 0 });
});

test('elapsedSecondsFromWallClock catches up from wall-clock time', () => {
  assert.equal(elapsedSecondsFromWallClock(15, 1_000, 11_999), 25);
  assert.equal(elapsedSecondsFromWallClock(15, 1_000, 12_000), 26);
});

test('elapsedSecondsFromWallClock does not subtract time when clocks move backward', () => {
  assert.equal(elapsedSecondsFromWallClock(15, 10_000, 1_000), 15);
});
