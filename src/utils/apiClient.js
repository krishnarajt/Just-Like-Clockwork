// API Client for Just Like Clockwork backend
// Handles all backend communication with graceful degradation
// If the backend is down, all methods return null and log warnings — never throw or block UI

import { v4 as uuidv4 } from 'uuid';
import { calculateSessionTotals, getDefaultSessionName, serializeLaps } from './sessionStore';

const BASE_URL = 'https://just-like-clockwork-backend.krishnarajthadesar.in/api';

// localStorage keys for auth tokens
const ACCESS_TOKEN_KEY = 'jlc_access_token';
const REFRESH_TOKEN_KEY = 'jlc_refresh_token';
const USERNAME_KEY = 'jlc_username';
const TOKEN_EXPIRY_KEY = 'jlc_token_expiry'; // epoch ms when access token expires
const SYNC_QUEUE_KEY = 'jlc_sync_queue'; // sessions queued for sync when backend was down
const SYNCED_SESSIONS_KEY = 'jlc_synced_session_ids'; // set of local session IDs already synced
const SYNCED_SESSION_MAP_KEY = 'jlc_synced_session_map'; // local session UUID -> backend DB id
const UPLOADED_IMAGES_KEY = 'jlc_uploaded_image_fingerprints'; // local lap ID -> image fingerprints

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
  const sessionUuid = session.sessionUuid || session.id;
  // Avoid duplicates by session id
  if (!queue.find((s) => (s.sessionUuid || s.id) === sessionUuid)) {
    queue.push(session);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  }
}

export function removeFromSyncQueue(sessionId) {
  const queue = getSyncQueue().filter((s) => s.id !== sessionId && s.sessionUuid !== sessionId);
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

export function getSyncedSessionMap() {
  try {
    const data = localStorage.getItem(SYNCED_SESSION_MAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function getBackendSessionIdForLocal(localSessionId) {
  const map = getSyncedSessionMap();
  return map[localSessionId] || null;
}

export function markSessionSynced(localSessionId, backendSessionId = null) {
  const ids = getSyncedSessionIds();
  if (!ids.includes(localSessionId)) {
    ids.push(localSessionId);
    localStorage.setItem(SYNCED_SESSIONS_KEY, JSON.stringify(ids));
  }
  if (backendSessionId) {
    const map = getSyncedSessionMap();
    map[localSessionId] = backendSessionId;
    localStorage.setItem(SYNCED_SESSION_MAP_KEY, JSON.stringify(map));
  }
}

export function unmarkSessionSynced(localSessionId) {
  const ids = getSyncedSessionIds().filter((id) => id !== localSessionId);
  localStorage.setItem(SYNCED_SESSIONS_KEY, JSON.stringify(ids));
  const map = getSyncedSessionMap();
  delete map[localSessionId];
  localStorage.setItem(SYNCED_SESSION_MAP_KEY, JSON.stringify(map));
}

function getUploadedImageMap() {
  try {
    const data = localStorage.getItem(UPLOADED_IMAGES_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function getLocalImageFingerprint(dataUrl) {
  if (!dataUrl) return '';
  return `${dataUrl.length}:${dataUrl.slice(0, 96)}:${dataUrl.slice(-96)}`;
}

function hasUploadedLocalImage(localLapId, fingerprint) {
  const map = getUploadedImageMap();
  return Boolean(map[localLapId]?.includes(fingerprint));
}

function markLocalImageUploaded(localLapId, fingerprint) {
  const map = getUploadedImageMap();
  const fingerprints = map[localLapId] || [];
  if (!fingerprints.includes(fingerprint)) {
    fingerprints.push(fingerprint);
    map[localLapId] = fingerprints;
    localStorage.setItem(UPLOADED_IMAGES_KEY, JSON.stringify(map));
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
 * This creates a session, adds all laps, and uploads any images.
 * Returns the backend session ID or null on failure.
 */
export async function syncSessionToBackend(localSession) {
  if (!isLoggedIn() || !localSession) return null;

  try {
    const sessionUuid = localSession.sessionUuid || localSession.id;
    const laps = Array.isArray(localSession.laps) ? localSession.laps : [];
    const totals = calculateSessionTotals(laps);
    const sessionName = localSession.sessionName || getDefaultSessionName(localSession.createdAt);
    const description = localSession.description || `${laps.length} laps, ${totals.totalSeconds}s total`;

    const sessionResult = await authRequest('/sessions/', {
      method: 'POST',
      body: JSON.stringify({
        sessionUuid,
        sessionName,
        description,
        startedAt: localSession.startTime || localSession.createdAt,
        endedAt: localSession.endTime || new Date().toISOString(),
        totalDuration: localSession.totalSeconds ?? totals.totalSeconds,
        totalAmount: localSession.totalAmount ?? totals.totalAmount,
        isCompleted: localSession.isCompleted ?? true,
      }),
    });

    if (!sessionResult || !sessionResult.id) {
      console.warn('[Sync] Failed to create session on backend');
      addToSyncQueue(localSession);
      return null;
    }

    const backendSessionId = sessionResult.id;

    // Add laps in chronological order. lapUuid makes the operation safe to retry.
    const chronologicalLaps = [...laps].reverse();
    for (const lap of chronologicalLaps) {
      const totalSec = (lap.current_hours || 0) * 3600 + (lap.current_minutes || 0) * 60 + (lap.current_seconds || 0);
      const lapResult = await authRequest(`/sessions/${backendSessionId}/laps`, {
        method: 'POST',
        body: JSON.stringify({
          lapUuid: lap.id,
          lapName: lap.workDoneString || '',
          workDoneString: lap.workDoneString || '',
          startedAt: lap.startTime,
          endedAt: lap.endTime === 0 ? null : lap.endTime,
          duration: totalSec,
          current_hours: lap.current_hours || 0,
          current_minutes: lap.current_minutes || 0,
          current_seconds: lap.current_seconds || 0,
          isBreakLap: lap.isBreakLap || false,
          hourlyAmount: lap.HourlyAmount || 0,
        }),
      });

      if (lapResult && lapResult.id) {
        if (lap.id) {
          await uploadLocalImagesToBackend(backendSessionId, lapResult.id, lap.id);
        }
      } else {
        throw new Error(`Failed to sync lap ${lap.id || '(missing id)'}`);
      }
    }

    await authRequest(`/sessions/${backendSessionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        sessionName,
        description,
        endedAt: localSession.endTime || new Date().toISOString(),
        totalDuration: localSession.totalSeconds ?? totals.totalSeconds,
        totalAmount: localSession.totalAmount ?? totals.totalAmount,
        isCompleted: localSession.isCompleted ?? true,
      }),
    });

    markSessionSynced(sessionUuid, backendSessionId);
    removeFromSyncQueue(sessionUuid);

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
 * Sends the frontend settings matching the DB model columns.
 * Returns updated settings or null.
 */
export async function updateSettingsOnBackend(settings) {
  return await authRequest('/settings/', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

/**
 * Sync all current frontend settings to the backend.
 * Reads from localStorage and pushes to backend.
 */
export async function syncAllSettingsToBackend() {
  if (!isLoggedIn()) return null;

  const settings = {
    showAmount: JSON.parse(localStorage.getItem('showAmount') || 'true'),
    showStatsBeforeLaps: JSON.parse(localStorage.getItem('showStatsBeforeLaps') || 'false'),
    breaksImpactAmount: JSON.parse(localStorage.getItem('breaksImpactAmount') || 'false'),
    breaksImpactTime: JSON.parse(localStorage.getItem('breaksImpactTime') || 'false'),
    minimalistMode: JSON.parse(localStorage.getItem('minimalistMode') || 'false'),
    notificationEnabled: JSON.parse(localStorage.getItem('notificationEnabled') || 'true'),
    notificationIntervalHours: JSON.parse(localStorage.getItem('notificationIntervalHours') || '2'),
    hourlyAmount: JSON.parse(localStorage.getItem('hourlyAmount') || '450'),
    // Also send as customSettings for the backend routes that use that field
    customSettings: {
      showAmount: JSON.parse(localStorage.getItem('showAmount') || 'true'),
      showStatsBeforeLaps: JSON.parse(localStorage.getItem('showStatsBeforeLaps') || 'false'),
      breaksImpactAmount: JSON.parse(localStorage.getItem('breaksImpactAmount') || 'false'),
      breaksImpactTime: JSON.parse(localStorage.getItem('breaksImpactTime') || 'false'),
      minimalistMode: JSON.parse(localStorage.getItem('minimalistMode') || 'false'),
      notificationEnabled: JSON.parse(localStorage.getItem('notificationEnabled') || 'true'),
      notificationIntervalHours: JSON.parse(localStorage.getItem('notificationIntervalHours') || '2'),
      hourlyAmount: JSON.parse(localStorage.getItem('hourlyAmount') || '450'),
    },
  };

  return await updateSettingsOnBackend(settings);
}

/**
 * Load settings from backend and apply to localStorage.
 */
export async function loadSettingsFromBackend() {
  if (!isLoggedIn()) return null;

  const result = await fetchSettings();
  if (!result) return null;

  // Apply settings to localStorage — check both direct fields and customSettings
  const settings = result.customSettings || result;

  if (settings.showAmount !== undefined) localStorage.setItem('showAmount', JSON.stringify(settings.showAmount));
  if (settings.showStatsBeforeLaps !== undefined) localStorage.setItem('showStatsBeforeLaps', JSON.stringify(settings.showStatsBeforeLaps));
  if (settings.breaksImpactAmount !== undefined) localStorage.setItem('breaksImpactAmount', JSON.stringify(settings.breaksImpactAmount));
  if (settings.breaksImpactTime !== undefined) localStorage.setItem('breaksImpactTime', JSON.stringify(settings.breaksImpactTime));
  if (settings.minimalistMode !== undefined) localStorage.setItem('minimalistMode', JSON.stringify(settings.minimalistMode));
  if (settings.notificationEnabled !== undefined) localStorage.setItem('notificationEnabled', JSON.stringify(settings.notificationEnabled));
  if (settings.notificationIntervalHours !== undefined) localStorage.setItem('notificationIntervalHours', JSON.stringify(settings.notificationIntervalHours));
  if (settings.hourlyAmount !== undefined) localStorage.setItem('hourlyAmount', JSON.stringify(settings.hourlyAmount));

  return settings;
}

// ============ Image Upload ============

/**
 * Make an authenticated request with file upload (multipart/form-data).
 * Does NOT set Content-Type — lets the browser set it with boundary.
 */
async function authUploadRequest(path, formData) {
  if (!isLoggedIn()) return null;

  if (isTokenExpiringSoon()) {
    await refreshAccessToken();
  }

  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        const newToken = getAccessToken();
        const retryResponse = await fetch(`${BASE_URL}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
          body: formData,
        });
        if (!retryResponse.ok) return null;
        return await retryResponse.json();
      }
      return null;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(`[API] Upload failed: ${response.status} ${path}`, errorBody);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.warn(`[API] Upload network error for ${path}:`, err.message);
    return null;
  }
}

/**
 * Upload a single image (from base64 data URL) to the backend for a specific lap.
 * Returns the image response or null.
 */
export async function uploadImageToBackend(sessionId, lapId, base64DataUrl, filename = 'image.jpg') {
  if (!isLoggedIn() || !sessionId || !lapId) return null;

  try {
    // Convert base64 data URL to Blob
    const response = await fetch(base64DataUrl);
    const blob = await response.blob();

    // Determine file extension from MIME type
    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const finalFilename = filename.includes('.') ? filename : `${filename}.${ext}`;

    const formData = new FormData();
    formData.append('file', blob, finalFilename);

    return await authUploadRequest(`/images/sessions/${sessionId}/laps/${lapId}/upload`, formData);
  } catch (err) {
    console.warn('[API] Image upload error:', err.message);
    return null;
  }
}

/**
 * Upload all localStorage images for a given local lap ID to the backend.
 * Called during session sync after a backend lap has been created.
 */
export async function uploadLocalImagesToBackend(backendSessionId, backendLapId, localLapId) {
  try {
    const IMAGE_PREFIX = 'clockwork_img_';
    const data = localStorage.getItem(IMAGE_PREFIX + localLapId);
    if (!data) return;

    const images = JSON.parse(data);
    if (!images || images.length === 0) return;

    console.log(`[Sync] Uploading ${images.length} images for lap ${localLapId}`);

    for (let i = 0; i < images.length; i++) {
      const fingerprint = getLocalImageFingerprint(images[i]);
      if (hasUploadedLocalImage(localLapId, fingerprint)) continue;

      const result = await uploadImageToBackend(backendSessionId, backendLapId, images[i], `lap_${localLapId}_img_${i}.jpg`);
      if (result && result.imageId) {
        markLocalImageUploaded(localLapId, fingerprint);
      }
      // Small delay between uploads
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.warn('[Sync] Image upload for lap failed:', err.message);
  }
}

/**
 * Fetch images for a specific lap from the backend.
 * Returns array of image objects with presigned URLs or empty array.
 */
export async function fetchLapImages(sessionId, lapId) {
  if (!isLoggedIn()) return [];
  const result = await authRequest(`/images/sessions/${sessionId}/laps/${lapId}`);
  return result || [];
}

/**
 * Fetch all images for an entire session from the backend.
 * Returns array of image objects with presigned URLs or empty array.
 */
export async function fetchSessionImages(sessionId) {
  if (!isLoggedIn()) return [];
  const result = await authRequest(`/images/sessions/${sessionId}`);
  return result || [];
}

/**
 * Delete an image from the backend by its image UUID.
 */
export async function deleteImageFromBackend(imageId) {
  return await authRequest(`/images/${imageId}`, { method: 'DELETE' });
}

// ============ Session & Lap Editing ============

/**
 * Update session metadata (name, description) on the backend.
 */
export async function updateSessionOnBackend(sessionId, updates) {
  return await authRequest(`/sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * Update a lap on the backend.
 * @param {number} sessionId - Backend session ID
 * @param {number} lapId - Backend lap ID
 * @param {object} updates - {lapName, endedAt, duration}
 */
export async function updateLapOnBackend(sessionId, lapId, updates) {
  return await authRequest(`/sessions/${sessionId}/laps/${lapId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * Delete a lap from the backend.
 */
export async function deleteLapFromBackend(sessionId, lapId) {
  return await authRequest(`/sessions/${sessionId}/laps/${lapId}`, { method: 'DELETE' });
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

const LIVE_SESSION_ID_KEY = 'jlc_live_backend_session_id';
const LIVE_SESSION_UUID_KEY = 'jlc_live_session_uuid';
// Track which lap IDs have already been pushed to the backend for the live session
const LIVE_SESSION_SYNCED_LAPS_KEY = 'jlc_live_synced_lap_ids';

let liveSessionIntervalId = null;

/**
 * Get the current live backend session ID (if any).
 */
export function getLiveBackendSessionId() {
  return localStorage.getItem(LIVE_SESSION_ID_KEY);
}

/**
 * Set the current live backend session ID.
 */
export function setLiveBackendSessionId(id) {
  if (id) {
    localStorage.setItem(LIVE_SESSION_ID_KEY, id);
  } else {
    localStorage.removeItem(LIVE_SESSION_ID_KEY);
  }
}

export function getLiveSessionUuid() {
  return localStorage.getItem(LIVE_SESSION_UUID_KEY);
}

export function setLiveSessionUuid(sessionUuid) {
  if (sessionUuid) {
    localStorage.setItem(LIVE_SESSION_UUID_KEY, sessionUuid);
  } else {
    localStorage.removeItem(LIVE_SESSION_UUID_KEY);
  }
}

export function ensureLiveSessionUuid(preferredUuid = null) {
  const existing = getLiveSessionUuid();
  const sessionUuid = preferredUuid || existing || uuidv4();
  if (sessionUuid !== existing) {
    setLiveSessionUuid(sessionUuid);
  }
  return sessionUuid;
}

/**
 * Get the set of lap IDs already synced to the live backend session.
 */
export function getLiveSyncedLapIds() {
  try {
    const data = localStorage.getItem(LIVE_SESSION_SYNCED_LAPS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Mark a lap ID as synced to the live backend session.
 */
export function markLapSyncedToLive(lapId) {
  const ids = getLiveSyncedLapIds();
  if (!ids.includes(lapId)) {
    ids.push(lapId);
    localStorage.setItem(LIVE_SESSION_SYNCED_LAPS_KEY, JSON.stringify(ids));
  }
}

/**
 * Clear live session tracking state.
 */
export function clearLiveSessionState() {
  localStorage.removeItem(LIVE_SESSION_ID_KEY);
  localStorage.removeItem(LIVE_SESSION_UUID_KEY);
  localStorage.removeItem(LIVE_SESSION_SYNCED_LAPS_KEY);
  localStorage.removeItem('jlc_live_session_backup');
}

/**
 * Create a new live (in-progress) session on the backend.
 * Returns the backend session ID or null.
 */
export async function createLiveSession(sessionName, startedAt, preferredSessionUuid = null) {
  if (!isLoggedIn()) return null;

  const sessionUuid = ensureLiveSessionUuid(preferredSessionUuid);
  const result = await authRequest('/sessions/', {
    method: 'POST',
    body: JSON.stringify({
      sessionUuid,
      sessionName: sessionName || getDefaultSessionName(startedAt || new Date().toISOString()),
      description: 'In progress...',
      startedAt: startedAt || new Date().toISOString(),
      isCompleted: false,
    }),
  });

  if (result && result.id) {
    setLiveBackendSessionId(result.id);
    return result.id;
  }
  return null;
}

/**
 * Add a completed lap to the live backend session.
 * Returns true on success.
 */
export async function addLapToLiveSession(lap) {
  if (!isLoggedIn()) return false;

  let backendSessionId = getLiveBackendSessionId();

  // If no live session exists yet, create one
  if (!backendSessionId) {
    backendSessionId = await createLiveSession(null, lap.startTime);
    if (!backendSessionId) return false;
  }

  // Check if this lap was already synced
  const syncedLapIds = getLiveSyncedLapIds();
  if (syncedLapIds.includes(lap.id)) {
    return true; // Already synced
  }

  const result = await authRequest(`/sessions/${backendSessionId}/laps`, {
    method: 'POST',
    body: JSON.stringify({
      lapUuid: lap.id,
      lapName: lap.workDoneString || '',
      workDoneString: lap.workDoneString || '',
      startedAt: lap.startTime,
      endedAt: lap.endTime === 0 ? null : lap.endTime,
      duration: (lap.current_hours || 0) * 3600 + (lap.current_minutes || 0) * 60 + (lap.current_seconds || 0),
      current_hours: lap.current_hours || 0,
      current_minutes: lap.current_minutes || 0,
      current_seconds: lap.current_seconds || 0,
      isBreakLap: lap.isBreakLap || false,
      hourlyAmount: lap.HourlyAmount || 0,
    }),
  });

  if (result) {
    markLapSyncedToLive(lap.id);

    // Upload images for this lap (non-blocking best-effort)
    if (result.id && lap.id) {
      uploadLocalImagesToBackend(backendSessionId, result.id, lap.id).catch(() => {
        console.warn('[LiveSync] Image upload failed for lap', lap.id);
      });
    }

    // Update session description with current lap count
    const syncedCount = getLiveSyncedLapIds().length;
    await authRequest(`/sessions/${backendSessionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: `${syncedCount} laps synced (in progress)`,
      }),
    });
    return true;
  }
  return false;
}

/**
 * Sync the entire current session state to the backend (for manual sync / browser switch).
 * Creates the session if needed, adds all unsynced laps.
 * Returns the backend session ID or null.
 */
export async function syncCurrentSessionToBackend(laps, options = {}) {
  if (!isLoggedIn() || !laps || laps.length === 0) return null;

  let backendSessionId = getLiveBackendSessionId();
  const sessionUuid = ensureLiveSessionUuid(options.sessionUuid || options.localSessionId || null);

  // Create session if not exists
  if (!backendSessionId) {
    const oldestLap = laps[laps.length - 1];
    backendSessionId = await createLiveSession(options.sessionName || null, oldestLap.startTime, sessionUuid);
    if (!backendSessionId) return null;
  }

  // Add all unsynced laps (in chronological order — oldest first)
  const syncedLapIds = getLiveSyncedLapIds();
  const chronologicalLaps = [...laps].reverse();

  for (const lap of chronologicalLaps) {
    if (syncedLapIds.includes(lap.id)) continue;

    const lapResult = await authRequest(`/sessions/${backendSessionId}/laps`, {
      method: 'POST',
      body: JSON.stringify({
        lapUuid: lap.id,
        lapName: lap.workDoneString || '',
        workDoneString: lap.workDoneString || '',
        startedAt: lap.startTime,
        endedAt: lap.endTime === 0 ? null : lap.endTime,
        duration: (lap.current_hours || 0) * 3600 + (lap.current_minutes || 0) * 60 + (lap.current_seconds || 0),
        current_hours: lap.current_hours || 0,
        current_minutes: lap.current_minutes || 0,
        current_seconds: lap.current_seconds || 0,
        isBreakLap: lap.isBreakLap || false,
        hourlyAmount: lap.HourlyAmount || 0,
      }),
    });

    if (lapResult && lapResult.id && lap.id) {
      markLapSyncedToLive(lap.id);
      await uploadLocalImagesToBackend(backendSessionId, lapResult.id, lap.id);
    } else {
      throw new Error(`Failed to sync live lap ${lap.id || '(missing id)'}`);
    }
  }

  const totals = calculateSessionTotals(laps);

  await authRequest(`/sessions/${backendSessionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      sessionName: options.sessionName,
      description: `${laps.length} laps, ${totals.totalSeconds}s total (in progress)`,
      totalDuration: totals.totalSeconds,
      totalAmount: totals.totalAmount,
      isCompleted: false,
    }),
  });

  return backendSessionId;
}

/**
 * Complete/finalize the live session on the backend.
 * Called when user stops the timer.
 * Returns the backend session ID or null.
 */
export async function completeLiveSession(laps, localSession = null) {
  if (!isLoggedIn() || !laps || laps.length === 0) return null;

  const localSessionId = localSession?.sessionUuid || localSession?.id || null;
  const sessionName = localSession?.sessionName || getDefaultSessionName(localSession?.createdAt);
  if (localSessionId) ensureLiveSessionUuid(localSessionId);

  // First sync all laps
  const backendSessionId = await syncCurrentSessionToBackend(laps, {
    localSessionId,
    sessionUuid: localSessionId,
    sessionName,
  });
  if (!backendSessionId) return null;

  const totals = calculateSessionTotals(laps);

  // Mark as completed
  await authRequest(`/sessions/${backendSessionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      sessionName,
      endedAt: new Date().toISOString(),
      totalDuration: totals.totalSeconds,
      totalAmount: totals.totalAmount,
      isCompleted: true,
      description: localSession?.description || `${laps.length} laps, ${totals.totalSeconds}s total`,
    }),
  });

  // Upload images: fetch the session detail to get backend lap IDs, then match to local laps
  try {
    const detail = await fetchSessionDetail(backendSessionId);
    if (detail && detail.laps && detail.laps.length > 0) {
      // Match backend laps to local laps by lap number (chronological order)
      const chronologicalLocal = [...laps].reverse(); // oldest first
      const backendLaps = detail.laps; // should already be in lap_number order

      for (let i = 0; i < Math.min(chronologicalLocal.length, backendLaps.length); i++) {
        const localLap = chronologicalLocal[i];
        const backendLap = backendLaps[i];
        if (localLap.id && backendLap.id) {
          await uploadLocalImagesToBackend(backendSessionId, backendLap.id, localLap.id);
        }
      }
    }
  } catch (err) {
    console.warn('[Sync] Image upload during session completion failed:', err.message);
  }

  // Clean up live session state
  if (localSessionId) {
    markSessionSynced(localSessionId, backendSessionId);
  }
  clearLiveSessionState();

  return backendSessionId;
}

/**
 * Fetch a single session's detail (with laps) from the backend.
 * Returns session object or null.
 */
export async function fetchSessionDetail(sessionId) {
  return await authRequest(`/sessions/${sessionId}`);
}

/**
 * Fetch laps for a specific session from the backend.
 * Returns array of laps or null.
 */
export async function fetchSessionLaps(sessionId) {
  return await authRequest(`/sessions/${sessionId}/laps`);
}

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
          sessionUuid: getLiveSessionUuid(),
          laps: serializeLaps(laps),
        })
      );
    } catch (e) {
      console.warn('[LiveSync] Failed to save backup:', e.message);
    }

    syncCurrentSessionToBackend(laps).catch((err) => {
      console.warn('[LiveSync] Periodic sync failed:', err.message);
    });
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
}
