import { getDefaultSessionName } from './sessionStore.js';

function numberOrZero(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function getBackendSessionUuid(session) {
  return session?.sessionUuid || session?.session_uuid || null;
}

export function normalizeBackendSession(session) {
  const sessionUuid = getBackendSessionUuid(session) || `backend:${session.id}`;
  const startedAt = session.startedAt || session.started_at || session.createdAt || session.created_at;
  const lapCount = numberOrZero(session.lapCount ?? session.lap_count);
  const totalSeconds = numberOrZero(
    session.totalSeconds ?? session.total_seconds ?? session.totalDuration ?? session.total_duration
  );

  return {
    id: sessionUuid,
    sessionUuid,
    createdAt: startedAt,
    startTime: session.startedAt || session.started_at || startedAt,
    endTime: session.endedAt || session.ended_at || null,
    lapCount,
    totalSeconds,
    totalAmount: numberOrZero(session.totalAmount ?? session.total_amount),
    // Same derivation as the local copy (name from the session's start time), so
    // a session with no stored name reads identically whichever side it came from.
    sessionName: session.sessionName || session.session_name || getDefaultSessionName(startedAt),
    description: session.description || '',
    isCompleted: session.isCompleted ?? session.is_completed ?? true,
    laps: Array.isArray(session.laps) ? session.laps : [],
    _source: 'backend',
    _backendId: session.id,
  };
}

export function mergeLocalAndBackendSessions(localSessions, backendSessions, syncedIds = []) {
  const merged = [];
  const backendByUuid = new Map();
  const seen = new Set();

  backendSessions.forEach((session) => {
    const normalized = normalizeBackendSession(session);
    backendByUuid.set(normalized.sessionUuid, normalized);
  });

  localSessions.forEach((localSession) => {
    const sessionUuid = localSession.sessionUuid || localSession.id;
    const backendSession = backendByUuid.get(sessionUuid);
    const hasCloudCopy = Boolean(backendSession);
    const markedSynced = syncedIds.includes(sessionUuid) || syncedIds.includes(localSession.id);

    merged.push({
      ...localSession,
      ...(backendSession || {}),
      id: sessionUuid,
      sessionUuid,
      createdAt: backendSession?.createdAt || localSession.createdAt,
      startTime: backendSession?.startTime || localSession.startTime,
      endTime: backendSession?.endTime || localSession.endTime,
      lapCount: backendSession?.lapCount || localSession.lapCount || localSession.laps?.length || 0,
      totalSeconds: backendSession?.totalSeconds ?? localSession.totalSeconds ?? 0,
      totalAmount: backendSession?.totalAmount ?? localSession.totalAmount ?? 0,
      sessionName: backendSession?.sessionName || localSession.sessionName || '',
      description: backendSession?.description ?? localSession.description ?? '',
      isCompleted: backendSession?.isCompleted ?? localSession.isCompleted ?? true,
      laps: localSession.laps || [],
      _source: hasCloudCopy || markedSynced ? 'synced' : 'local',
      _localId: localSession.id,
      _backendId: backendSession?._backendId || null,
    });

    seen.add(sessionUuid);
  });

  backendByUuid.forEach((backendSession, sessionUuid) => {
    if (!seen.has(sessionUuid)) {
      merged.push(backendSession);
    }
  });

  merged.sort((a, b) => {
    const bTime = new Date(b.createdAt || b.startTime || 0).getTime() || 0;
    const aTime = new Date(a.createdAt || a.startTime || 0).getTime() || 0;
    return bTime - aTime;
  });

  return merged;
}
