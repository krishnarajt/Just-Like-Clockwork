// Session storage utility
// Manages work sessions saved to localStorage
// Will be replaced with API calls to a backend later

import { v4 as uuidv4 } from 'uuid';

const SESSIONS_KEY = 'clockwork_sessions';

/**
 * Get all saved sessions from localStorage
 * @returns {Array} Array of session objects
 */
export function getSessions() {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new session
 * @param {object} session - Session object with laps data
 * @returns {string} The session ID
 */
export function saveSession(laps) {
  const sessions = getSessions();

  // Serialize laps to plain objects
  const serializedLaps = laps.map((lap) => ({
    id: lap.id,
    startTime: lap.startTime,
    endTime: lap.endTime,
    current_hours: lap.current_hours,
    current_minutes: lap.current_minutes,
    current_seconds: lap.current_seconds,
    workDoneString: lap.workDoneString,
    isBreakLap: lap.isBreakLap,
    HourlyAmount: lap.HourlyAmount,
  }));

  // Calculate total time
  let totalSeconds = 0;
  laps.forEach((lap) => {
    totalSeconds +=
      (lap.current_hours || 0) * 3600 +
      (lap.current_minutes || 0) * 60 +
      (lap.current_seconds || 0);
  });

  // Calculate total amount
  let totalAmount = 0;
  laps.forEach((lap) => {
    if (typeof lap.getAmount === 'function') {
      totalAmount += lap.getAmount();
    }
  });

  const session = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    startTime: laps.length > 0 ? laps[laps.length - 1].startTime : null, // Oldest lap (last in reversed array)
    endTime: new Date().toLocaleString(),
    lapCount: laps.length,
    totalSeconds,
    totalAmount: Math.round(totalAmount * 100) / 100,
    laps: serializedLaps,
  };

  sessions.unshift(session); // Add newest first

  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save session to localStorage:', e);
  }

  return session.id;
}

/**
 * Delete a session by ID
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  const sessions = getSessions();
  const filtered = sessions.filter((s) => s.id !== sessionId);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
}

/**
 * Clear all sessions
 */
export function clearAllSessions() {
  localStorage.removeItem(SESSIONS_KEY);
}

/**
 * Get a single session by ID
 * @param {string} sessionId
 * @returns {object|null}
 */
export function getSessionById(sessionId) {
  const sessions = getSessions();
  return sessions.find((s) => s.id === sessionId) || null;
}
