// Session storage utility.
// Local sessions use the same UUID that the backend stores as sessionUuid.

import { v4 as uuidv4 } from 'uuid';
import { formatSessionNameDateTime } from './timeFormat.js';
import { deleteImages } from './imageStore.js';

const SESSIONS_KEY = 'clockwork_sessions';

export function getDefaultSessionName(startedAt = new Date().toISOString()) {
  return `Session ${formatSessionNameDateTime(startedAt)}`;
}

/**
 * The start time of a session, taken from its oldest lap.
 * Laps are stored newest-first, so the oldest is the last element.
 * This is the one value a session's default name is derived from, on both the
 * client and the backend, so the two always agree.
 */
export function sessionStartFromLaps(laps = []) {
  if (!Array.isArray(laps) || laps.length === 0) return null;
  return laps[laps.length - 1]?.startTime || null;
}

export function serializeLaps(laps = []) {
  return laps.map((lap) => ({
    id: lap.id,
    startTime: lap.startTime,
    endTime: lap.endTime,
    current_hours: Number(lap.current_hours || 0),
    current_minutes: Number(lap.current_minutes || 0),
    current_seconds: Number(lap.current_seconds || 0),
    workDoneString: lap.workDoneString || '',
    isBreakLap: Boolean(lap.isBreakLap),
    HourlyAmount: Number(lap.HourlyAmount || 0),
  }));
}

export function getLapDurationSeconds(lap) {
  return (
    Number(lap.current_hours || 0) * 3600 +
    Number(lap.current_minutes || 0) * 60 +
    Number(lap.current_seconds || 0)
  );
}

export function calculateSessionTotals(laps = []) {
  let totalSeconds = 0;
  let totalAmount = 0;

  laps.forEach((lap) => {
    const seconds = getLapDurationSeconds(lap);
    totalSeconds += seconds;
    if (typeof lap.getAmount === 'function') {
      totalAmount += Number(lap.getAmount() || 0);
    } else {
      totalAmount += Number(lap.HourlyAmount || 0) * (seconds / 3600);
    }
  });

  return {
    totalSeconds,
    totalAmount: Math.round(totalAmount * 1000) / 1000,
  };
}

function normalizeStoredSession(session) {
  const laps = Array.isArray(session.laps) ? session.laps : [];
  const totals = calculateSessionTotals(laps);
  const createdAt = session.createdAt || new Date().toISOString();
  const id = session.id || session.sessionUuid || uuidv4();
  const startTime = session.startTime || sessionStartFromLaps(laps) || createdAt;

  return {
    ...session,
    id,
    sessionUuid: session.sessionUuid || id,
    createdAt,
    // Named after the session's start, never its createdAt. createdAt is stamped
    // when the session is saved (i.e. when the timer stops), so naming from it
    // produced a different name than the backend's, which derives from the
    // first lap's start time.
    sessionName: session.sessionName || getDefaultSessionName(startTime),
    description: session.description || '',
    startTime,
    endTime: session.endTime || null,
    lapCount: Number(session.lapCount ?? laps.length),
    totalSeconds: Number(session.totalSeconds ?? totals.totalSeconds),
    totalAmount: Number(session.totalAmount ?? totals.totalAmount),
    isCompleted: session.isCompleted ?? true,
    laps,
  };
}

function writeSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.map(normalizeStoredSession)));
}

/**
 * Get all saved sessions from localStorage.
 * @returns {Array} Array of session objects
 */
export function getSessions() {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    if (!data) return [];
    const sessions = JSON.parse(data);
    if (!Array.isArray(sessions)) return [];
    return sessions.map(normalizeStoredSession);
  } catch {
    return [];
  }
}

/**
 * Save a completed session.
 * @param {Array} laps - WorkLap instances or serialized lap objects
 * @param {object} options - Optional session metadata, including id/sessionUuid
 * @returns {string} The stable local/cloud session UUID
 */
export function saveSession(laps, options = {}) {
  const sessions = getSessions();
  const serializedLaps = serializeLaps(laps);
  const totals = calculateSessionTotals(laps);
  const createdAt = options.createdAt || new Date().toISOString();
  const sessionId = options.id || options.sessionUuid || uuidv4();
  const existing = sessions.find((s) => s.id === sessionId || s.sessionUuid === sessionId);

  const startTime =
    options.startTime ||
    existing?.startTime ||
    sessionStartFromLaps(serializedLaps) ||
    createdAt;

  const session = normalizeStoredSession({
    ...(existing || {}),
    id: sessionId,
    sessionUuid: sessionId,
    createdAt: existing?.createdAt || createdAt,
    sessionName: options.sessionName || existing?.sessionName || getDefaultSessionName(startTime),
    description: options.description ?? existing?.description ?? '',
    startTime,
    endTime: options.endTime || new Date().toISOString(),
    lapCount: serializedLaps.length,
    totalSeconds: totals.totalSeconds,
    totalAmount: totals.totalAmount,
    isCompleted: true,
    laps: serializedLaps,
  });

  const nextSessions = [session, ...sessions.filter((s) => s.id !== sessionId && s.sessionUuid !== sessionId)];

  try {
    writeSessions(nextSessions);
  } catch (e) {
    console.warn('Failed to save session to localStorage:', e);
  }

  return session.id;
}

/**
 * Patch a saved session in localStorage.
 * @param {string} sessionId
 * @param {object|Function} updates
 */
export function updateSession(sessionId, updates) {
  const sessions = getSessions();
  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId && session.sessionUuid !== sessionId) return session;
    const patch = typeof updates === 'function' ? updates(session) : updates;
    return normalizeStoredSession({ ...session, ...patch });
  });
  writeSessions(nextSessions);
}

/**
 * Delete a session by ID.
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  const sessions = getSessions();
  const removed = sessions.filter((s) => s.id === sessionId || s.sessionUuid === sessionId);
  const filtered = sessions.filter((s) => s.id !== sessionId && s.sessionUuid !== sessionId);
  writeSessions(filtered);
  // Attachments are keyed by lap id and live in the same localStorage quota as
  // everything else. Nothing used to remove them, so they accumulated until the
  // quota filled and further writes started failing.
  removed.forEach((session) => {
    (session.laps || []).forEach((lap) => {
      if (lap?.id) deleteImages(String(lap.id));
    });
  });
}

/**
 * Clear all sessions.
 */
export function clearAllSessions() {
  const sessions = getSessions();
  localStorage.removeItem(SESSIONS_KEY);
  sessions.forEach((session) => {
    (session.laps || []).forEach((lap) => {
      if (lap?.id) deleteImages(String(lap.id));
    });
  });
}

/**
 * Get a single session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
export function getSessionById(sessionId) {
  return getSessions().find((s) => s.id === sessionId || s.sessionUuid === sessionId) || null;
}
