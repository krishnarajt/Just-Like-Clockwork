// Session storage utility.
// Local sessions use the same UUID that the backend stores as sessionUuid.

import { v4 as uuidv4 } from 'uuid';
import { formatSessionNameDateTime } from './timeFormat.js';

const SESSIONS_KEY = 'clockwork_sessions';

export function getDefaultSessionName(createdAt = new Date().toISOString()) {
  return `Session ${formatSessionNameDateTime(createdAt)}`;
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

  return {
    ...session,
    id,
    sessionUuid: session.sessionUuid || id,
    createdAt,
    sessionName: session.sessionName || getDefaultSessionName(createdAt),
    description: session.description || '',
    startTime: session.startTime || (laps.length > 0 ? laps[laps.length - 1].startTime : createdAt),
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

  const session = normalizeStoredSession({
    ...(existing || {}),
    id: sessionId,
    sessionUuid: sessionId,
    createdAt: existing?.createdAt || createdAt,
    sessionName: options.sessionName || existing?.sessionName || getDefaultSessionName(createdAt),
    description: options.description ?? existing?.description ?? '',
    startTime:
      options.startTime ||
      existing?.startTime ||
      (serializedLaps.length > 0 ? serializedLaps[serializedLaps.length - 1].startTime : createdAt),
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
  const filtered = getSessions().filter((s) => s.id !== sessionId && s.sessionUuid !== sessionId);
  writeSessions(filtered);
}

/**
 * Clear all sessions.
 */
export function clearAllSessions() {
  localStorage.removeItem(SESSIONS_KEY);
}

/**
 * Get a single session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
export function getSessionById(sessionId) {
  return getSessions().find((s) => s.id === sessionId || s.sessionUuid === sessionId) || null;
}
