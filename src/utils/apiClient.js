// API Client for Just Like Clockwork backend
// Handles all backend communication with graceful degradation
// If the backend is down, all methods return null and log warnings — never throw or block UI

const BASE_URL = 'https://just-like-clockwork-backend.krishnarajthadesar.in/api';

// localStorage keys for auth tokens
const ACCESS_TOKEN_KEY = 'jlc_access_token';
const REFRESH_TOKEN_KEY = 'jlc_refresh_token';
const USERNAME_KEY = 'jlc_username';
const TOKEN_EXPIRY_KEY = 'jlc_token_expiry'; // epoch ms when access token expires
const SYNC_QUEUE_KEY = 'jlc_sync_queue'; // sessions queued for sync when backend was down
const SYNCED_SESSIONS_KEY = 'jlc_synced_session_ids'; // set of local session IDs already synced

// ============ Token Management ============

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

export function setTokens(accessToken, refreshToken, username) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (username) localStorage.setItem(USERNAME_KEY, username);
  // Access token expires in 30 minutes, set expiry with 2 min buffer
  const expiryMs = Date.now() + 28 * 60 * 1000;
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function isLoggedIn() {
  return !!getAccessToken() && !!getRefreshToken();
}

export function isTokenExpiringSoon() {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  // Consider "expiring soon" if less than 5 minutes left
  return Date.now() > (Number(expiry) - 5 * 60 * 1000);
}

// ============ Sync Queue (for offline resilience) ============

export function getSyncQueue() {
  try {
    const data = localStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToSyncQueue(session) {
  const queue = getSyncQueue();
  // Avoid duplicates by session id
  if (!queue.find((s) => s.id === session.id)) {
    queue.push(session);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  }
}

export function removeFromSyncQueue(sessionId) {
  const queue = getSyncQueue().filter((s) => s.id !== sessionId);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function clearSyncQueue() {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

// ============ Synced Sessions Tracking ============

export function getSyncedSessionIds() {
  try {
    const data = localStorage.getItem(SYNCED_SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function markSessionSynced(localSessionId) {
  const ids = getSyncedSessionIds();
  if (!ids.includes(localSessionId)) {
    ids.push(localSessionId);
    localStorage.setItem(SYNCED_SESSIONS_KEY, JSON.stringify(ids));
  }
}

// ============ Core Request Helper ============

/**
 * Make an authenticated API request with automatic token refresh.
 * Returns the parsed JSON response or null on any failure.
 * NEVER throws — all errors are caught and logged.
 */
async function authRequest(path, options = {}) {
  if (!isLoggedIn()) return null;

  // If token is expiring soon, try to refresh first
  if (isTokenExpiringSoon()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // Refresh failed — tokens might be expired entirely
      // Don't clear tokens yet, let the caller decide
      console.warn('[API] Token refresh failed, proceeding with current token');
    }
  }

  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      // Try one more refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the request with new token
        const newToken = getAccessToken();
        const retryResponse = await fetch(`${BASE_URL}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newToken}`,
            ...(options.headers || {}),
          },
        });
        if (!retryResponse.ok) {
          console.warn(`[API] Retry failed: ${retryResponse.status} ${path}`);
          return null;
        }
        return await retryResponse.json();
      }
      console.warn('[API] Authentication failed, tokens may be expired');
      return null;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(`[API] Request failed: ${response.status} ${path}`, errorBody);
      return null;
    }

    return await response.json();
  } catch (err) {
    // Network error, backend down, etc.
    console.warn(`[API] Network error for ${path}:`, err.message);
    return null;
  }
}

/**
 * Make an unauthenticated API request.
 * Returns the parsed JSON or null on failure.
 */
async function publicRequest(path, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return { error: true, status: response.status, detail: errorBody.detail || 'Request failed' };
    }

    return await response.json();
  } catch (err) {
    console.warn(`[API] Network error for ${path}:`, err.message);
    return null;
  }
}

// ============ Auth Endpoints ============

/**
 * Login with username and password.
 * Returns { accessToken, refreshToken, message } or { error, detail } or null.
 */
export async function login(username, password) {
  const result = await publicRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (result && !result.error && result.accessToken) {
    setTokens(result.accessToken, result.refreshToken, username);
  }

  return result;
}

/**
 * Signup with username and password.
 * Returns { accessToken, refreshToken, message } or { error, detail } or null.
 */
export async function signup(username, password) {
  const result = await publicRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (result && !result.error && result.accessToken) {
    setTokens(result.accessToken, result.refreshToken, username);
  }

  return result;
}

/**
 * Refresh the access token using the stored refresh token.
 * Returns true if successful, false otherwise.
 */
export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.warn('[API] Token refresh failed:', response.status);
      return false;
    }

    const data = await response.json();
    if (data.accessToken) {
      // Update only the access token and its expiry
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      const expiryMs = Date.now() + 28 * 60 * 1000;
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[API] Token refresh network error:', err.message);
    return false;
  }
}

/**
 * Logout — revoke refresh token and clear local auth state.
 */
export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    // Best-effort revoke on server
    await publicRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearTokens();
}

// ============ Health Check ============

/**
 * Check if the backend is reachable.
 * Returns true if healthy, false otherwise.
 */
export async function checkBackendHealth() {
  try {
    const response = await fetch(`${BASE_URL.replace('/api', '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============ Session Sync ============

/**
 * Push a completed session (from localStorage format) to the backend.
 * This creates a session and adds all laps to it.
 * Returns the backend session ID or null on failure.
 */
export async function syncSessionToBackend(localSession) {
  if (!isLoggedIn()) return null;

  // Check if already synced
  const syncedIds = getSyncedSessionIds();
  if (syncedIds.includes(localSession.id)) {
    return 'already_synced';
  }

  try {
    // Step 1: Create session on backend
    const sessionResult = await authRequest('/sessions/', {
      method: 'POST',
      body: JSON.stringify({
        sessionName: localSession.sessionName || `Session ${new Date(localSession.createdAt).toLocaleDateString()}`,
        description: `${localSession.lapCount} laps, ${localSession.totalSeconds}s total`,
        startedAt: localSession.startTime || localSession.createdAt,
      }),
    });

    if (!sessionResult || !sessionResult.id) {
      console.warn('[Sync] Failed to create session on backend');
      addToSyncQueue(localSession);
      return null;
    }

    const backendSessionId = sessionResult.id;

    // Step 2: Add laps (in chronological order — reversed since stored newest-first)
    const chronologicalLaps = [...(localSession.laps || [])].reverse();
    for (const lap of chronologicalLaps) {
      await authRequest(`/sessions/${backendSessionId}/laps`, {
        method: 'POST',
        body: JSON.stringify({
          lapName: lap.workDoneString || '',
          startedAt: lap.startTime,
        }),
      });

      // Note: We don't block on lap creation failure
      // The session itself is created, laps are best-effort
    }

    // Step 3: Mark session as complete with totals
    await authRequest(`/sessions/${backendSessionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        endedAt: localSession.endTime || new Date().toISOString(),
        totalDuration: localSession.totalSeconds,
        isCompleted: true,
      }),
    });

    // Mark as synced locally
    markSessionSynced(localSession.id);
    removeFromSyncQueue(localSession.id);

    return backendSessionId;
  } catch (err) {
    console.warn('[Sync] Session sync error:', err.message);
    addToSyncQueue(localSession);
    return null;
  }
}

/**
 * Process the sync queue — attempt to push any queued sessions.
 */
export async function processSyncQueue() {
  if (!isLoggedIn()) return;

  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const healthy = await checkBackendHealth();
  if (!healthy) return;

  console.log(`[Sync] Processing ${queue.length} queued sessions...`);

  for (const session of queue) {
    await syncSessionToBackend(session);
    // Small delay between syncs to be gentle on the server
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Fetch all sessions from the backend.
 * Returns array of sessions or null.
 */
export async function fetchBackendSessions(limit = 50, offset = 0) {
  return await authRequest(`/sessions/?limit=${limit}&offset=${offset}`);
}

/**
 * Delete a session on the backend by its ID.
 */
export async function deleteBackendSession(sessionId) {
  return await authRequest(`/sessions/${sessionId}`, { method: 'DELETE' });
}

// ============ Settings Sync ============

/**
 * Fetch user settings from backend.
 * Returns settings object or null.
 */
export async function fetchSettings() {
  return await authRequest('/settings/');
}

/**
 * Push settings to backend.
 * Returns updated settings or null.
 */
export async function updateSettingsOnBackend(settings) {
  return await authRequest('/settings/', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ============ Periodic Background Sync ============

let syncIntervalId = null;
let tokenRefreshIntervalId = null;

/**
 * Start periodic background sync and token refresh.
 * - Token refresh: every 25 minutes
 * - Session sync queue processing: every 5 minutes
 */
export function startBackgroundSync() {
  stopBackgroundSync(); // Clear any existing intervals

  // Token refresh every 25 minutes
  tokenRefreshIntervalId = setInterval(async () => {
    if (isLoggedIn() && isTokenExpiringSoon()) {
      console.log('[Background] Refreshing access token...');
      await refreshAccessToken();
    }
  }, 25 * 60 * 1000);

  // Process sync queue every 5 minutes
  syncIntervalId = setInterval(async () => {
    if (isLoggedIn()) {
      await processSyncQueue();
    }
  }, 5 * 60 * 1000);

  // Also run immediately
  if (isLoggedIn()) {
    processSyncQueue();
  }
}

/**
 * Stop all background sync intervals.
 */
export function stopBackgroundSync() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (tokenRefreshIntervalId) {
    clearInterval(tokenRefreshIntervalId);
    tokenRefreshIntervalId = null;
  }
}

// ============ Live Session Sync (save current laps periodically) ============

let liveSessionIntervalId = null;
let currentBackendLiveSessionId = null;

/**
 * Start periodically saving the current live session state to the backend.
 * Called when the timer starts; should be called with a getter for current laps.
 */
export function startLiveSessionSync(getLaps) {
  stopLiveSessionSync();

  // Sync every 3 minutes while timer is running
  liveSessionIntervalId = setInterval(async () => {
    if (!isLoggedIn()) return;

    const laps = getLaps();
    if (!laps || laps.length === 0) return;

    // Save current state to a "live" localStorage key as well (redundancy)
    try {
      localStorage.setItem(
        'jlc_live_session_backup',
        JSON.stringify({
          timestamp: Date.now(),
          laps: laps.map((lap) => ({
            id: lap.id,
            startTime: lap.startTime,
            endTime: lap.endTime,
            current_hours: lap.current_hours,
            current_minutes: lap.current_minutes,
            current_seconds: lap.current_seconds,
            workDoneString: lap.workDoneString,
            isBreakLap: lap.isBreakLap,
            HourlyAmount: lap.HourlyAmount,
          })),
        })
      );
    } catch (e) {
      console.warn('[LiveSync] Failed to save backup:', e.message);
    }
  }, 3 * 60 * 1000);
}

/**
 * Stop the live session sync interval.
 */
export function stopLiveSessionSync() {
  if (liveSessionIntervalId) {
    clearInterval(liveSessionIntervalId);
    liveSessionIntervalId = null;
  }
  currentBackendLiveSessionId = null;
}
