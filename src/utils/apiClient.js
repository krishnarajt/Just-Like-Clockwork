// API Client for Just Like Clockwork backend
// Handles all backend communication with graceful degradation
// If the backend is down, all methods return null and log warnings — never throw or block UI

import { v4 as uuidv4 } from 'uuid';
import {
  calculateSessionTotals,
  deleteSession,
  getDefaultSessionName,
  getSessions,
  serializeLaps,
  sessionStartFromLaps,
} from './sessionStore.js';
import { getBackendSessionUuid } from './sessionMerge.js';
import { uploadedImageName } from './imageStore.js';

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
  // These record what has already been pushed, and they are only meaningful for
  // the account that pushed it. Keeping them across a logout made a sync into a
  // second account skip every image and session it thought it had already sent,
  // while still reporting success.
  localStorage.removeItem(UPLOADED_IMAGES_KEY);
  localStorage.removeItem(SYNCED_SESSIONS_KEY);
  localStorage.removeItem(SYNCED_SESSION_MAP_KEY);
  clearLiveSessionState();
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
    const startedAt = localSession.startTime || sessionStartFromLaps(laps) || localSession.createdAt;
    const sessionName = localSession.sessionName || getDefaultSessionName(startedAt);
    const description = localSession.description || `${laps.length} laps, ${totals.totalSeconds}s total`;

    const sessionResult = await authRequest('/sessions/', {
      method: 'POST',
      body: JSON.stringify({
        sessionUuid,
        sessionName,
        description,
        startedAt,
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

// ============ Reconcile (the "Sync" button) ============

/**
 * Read a session back from the server and check it matches the local copy.
 * This gates the local delete: without it, a write the server accepts but
 * stores wrong would take the only copy of a session with it.
 * Returns { ok: true } or { ok: false, reason }.
 */
async function verifyServerCopy(sessionUuid, localSession) {
  const remote = await authRequest(`/sessions/${sessionUuid}`);
  if (!remote || !remote.id) return { ok: false, reason: 'could not read it back' };

  const localLaps = Array.isArray(localSession.laps) ? localSession.laps : [];
  const remoteLaps = Array.isArray(remote.laps) ? remote.laps : [];
  if (remoteLaps.length !== localLaps.length) {
    return { ok: false, reason: `server has ${remoteLaps.length} laps, local has ${localLaps.length}` };
  }

  const localSeconds = calculateSessionTotals(localLaps).totalSeconds;
  const remoteSeconds = Number(remote.totalSeconds ?? remote.totalDuration ?? NaN);
  if (!Number.isFinite(remoteSeconds) || remoteSeconds !== localSeconds) {
    return { ok: false, reason: `server total ${remoteSeconds}s, local total ${localSeconds}s` };
  }

  return { ok: true };
}

/**
 * Reconcile every local session against the server for the logged-in user.
 *
 * For each local session: upload it if the server does not have it, read the
 * server copy back, and delete the local copy only once the two agree. The
 * server is then the single source of truth and the Sessions list renders from
 * it, so there is no second copy left to drift.
 *
 * Sessions that fail to upload or fail verification are deliberately KEPT
 * locally and reported, so nothing is ever deleted on the strength of a write
 * that might not have landed.
 *
 * Returns { uploaded, verified, keptLocally, problems: string[] }.
 */
function emptySummary() {
  return { uploaded: 0, verified: 0, keptLocally: 0, problems: [] };
}

/**
 * Reconcile a single local session, folding the outcome into `summary`.
 * Pass `alreadyOnServer` when the caller has already listed the server's
 * sessions, to skip a redundant upload.
 */
async function reconcileSession(localSession, summary, alreadyOnServer = false) {
  const sessionUuid = localSession.sessionUuid || localSession.id;
  const label = localSession.sessionName || sessionUuid;

  if (!alreadyOnServer) {
    const backendId = await syncSessionToBackend(localSession);
    if (!backendId) {
      summary.keptLocally += 1;
      summary.problems.push(`"${label}" could not be uploaded, kept on this device.`);
      return summary;
    }
    summary.uploaded += 1;
  }

  const verdict = await verifyServerCopy(sessionUuid, localSession);
  if (!verdict.ok) {
    summary.keptLocally += 1;
    summary.problems.push(`"${label}" did not match the cloud copy (${verdict.reason}), kept on this device.`);
    return summary;
  }

  deleteSession(sessionUuid);
  unmarkSessionSynced(sessionUuid);
  // Drop any queued retry too, otherwise background sync would keep pushing a
  // stale snapshot of a session that is already confirmed in the cloud.
  removeFromSyncQueue(sessionUuid);
  summary.verified += 1;
  return summary;
}

/** Reconcile one session on its own (the per-row Sync button). */
export async function reconcileOneSession(localSession) {
  const summary = emptySummary();
  if (!isLoggedIn() || !localSession) {
    summary.problems.push('Not signed in.');
    return summary;
  }
  return reconcileSession(localSession, summary);
}

export async function reconcileAllSessions() {
  const summary = emptySummary();

  if (!isLoggedIn()) {
    summary.problems.push('Not signed in.');
    return summary;
  }

  const serverList = await fetchBackendSessions(100, 0);
  if (!Array.isArray(serverList)) {
    summary.problems.push('Could not list cloud sessions, so nothing was deleted locally.');
    return summary;
  }

  const onServer = new Set();
  serverList.forEach((s) => {
    const uuid = getBackendSessionUuid(s);
    if (uuid) onServer.add(uuid);
  });

  for (const localSession of getSessions()) {
    const sessionUuid = localSession.sessionUuid || localSession.id;
    await reconcileSession(localSession, summary, onServer.has(sessionUuid));
  }

  return summary;
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
/** Read a stored boolean, tolerating anything that is not valid JSON. */
function storedBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return Boolean(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * Read a stored number. Any non-numeric value (an empty rate box persisted "")
 * falls back, because the backend types these as floats and rejected the whole
 * payload with a 422 — which surfaced to the user as "backend may be down"
 * while every other setting silently failed to save too.
 */
function storedNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === '') return fallback;
  const parsed = parseFloat(typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function syncAllSettingsToBackend() {
  if (!isLoggedIn()) return null;

  // Flat fields only. The backend's UpdateSettingsRequest has no customSettings
  // field, so pydantic dropped that duplicate block on every request.
  const settings = {
    showAmount: storedBool('showAmount', true),
    showStatsBeforeLaps: storedBool('showStatsBeforeLaps', false),
    breaksImpactAmount: storedBool('breaksImpactAmount', false),
    breaksImpactTime: storedBool('breaksImpactTime', false),
    minimalistMode: storedBool('minimalistMode', false),
    notificationEnabled: storedBool('notificationEnabled', true),
    notificationIntervalHours: storedNumber('notificationIntervalHours', 2),
    hourlyAmount: storedNumber('hourlyAmount', 450),
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

  // Nothing has ever been saved for this account, so there is nothing to apply.
  // Returning null here keeps a customised local setup intact instead of
  // replacing it with server defaults and reporting success.
  if (result.isDefault) return null;

  const settings = result;

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

      // Name it after the image's own bytes, not its index. Indices shift when
      // an image is deleted, which made a cloud copy impossible to match back
      // to the local one it came from.
      const result = await uploadImageToBackend(
        backendSessionId,
        backendLapId,
        images[i],
        uploadedImageName(localLapId, images[i]),
      );
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
 * Forget that a lap was pushed, so the next sync sends it again.
 * Needed when a lap's duration changes after it was already synced (splitting or
 * merging): the backend upserts on lapUuid, but only laps absent from this list
 * are sent at all, so without this the stale cloud row was never corrected.
 */
export function unmarkLapSyncedToLive(lapId) {
  const ids = getLiveSyncedLapIds().filter((id) => id !== lapId);
  localStorage.setItem(LIVE_SESSION_SYNCED_LAPS_KEY, JSON.stringify(ids));
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

    // No description PUT here on purpose. It used to write a running lap count
    // into the description on every lap, which overwrote whatever the user had
    // typed there. The lap count is already its own field on the session.
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

  // sessionName is only sent when the caller supplied one, and description is
  // never sent from here: both used to be rewritten on every periodic sync,
  // so an in-progress session's name and description kept changing underneath
  // the user and diverged from the local copy.
  await authRequest(`/sessions/${backendSessionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...(options.sessionName ? { sessionName: options.sessionName } : {}),
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
  const startedAt =
    localSession?.startTime || sessionStartFromLaps(laps) || localSession?.createdAt;
  const sessionName = localSession?.sessionName || getDefaultSessionName(startedAt);
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
