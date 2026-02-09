import { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, deleteSession, clearAllSessions } from '../utils/sessionStore';
import {
  getSyncedSessionIds,
  syncSessionToBackend,
  isLoggedIn,
  fetchBackendSessions,
  fetchSessionDetail,
  fetchSessionLaps,
  deleteBackendSession,
} from '../utils/apiClient';
import { AuthContext } from '../context/AuthContext';
import { getImages } from '../utils/imageStore';
import {
  exportSessionCSV,
  exportSessionJSON,
  exportSessionPDF,
  exportAllSessionsCSV,
  exportAllSessionsJSON,
  exportAllSessionsPDF,
} from '../components/export/to_session';

export default function Sessions() {
  const [localSessions, setLocalSessions] = useState([]);
  const [backendSessions, setBackendSessions] = useState([]);
  const [mergedSessions, setMergedSessions] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);
  const [expandedLaps, setExpandedLaps] = useState({}); // sessionId -> laps array (for backend sessions)
  const [expandedImages, setExpandedImages] = useState({}); // lapId -> images array
  const [loadingLaps, setLoadingLaps] = useState(null); // sessionId currently loading
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [syncedIds, setSyncedIds] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const { loggedIn, backendOnline } = useContext(AuthContext);

  // Load local sessions
  useEffect(() => {
    setLocalSessions(getSessions());
    setSyncedIds(getSyncedSessionIds());
  }, []);

  // Load backend sessions when logged in
  const loadBackendSessions = useCallback(async () => {
    if (!loggedIn || !backendOnline) return;
    setBackendLoading(true);
    try {
      const result = await fetchBackendSessions(100, 0);
      if (result && Array.isArray(result)) {
        setBackendSessions(result);
      } else if (result && result.sessions && Array.isArray(result.sessions)) {
        // Handle paginated response format
        setBackendSessions(result.sessions);
      }
    } catch (err) {
      console.warn('[Sessions] Failed to load backend sessions:', err);
    }
    setBackendLoading(false);
  }, [loggedIn, backendOnline]);

  useEffect(() => {
    loadBackendSessions();
  }, [loadBackendSessions]);

  // Merge local and backend sessions
  useEffect(() => {
    const synced = getSyncedSessionIds();
    const merged = [];

    // Add all local sessions with source marker
    localSessions.forEach((s) => {
      merged.push({
        ...s,
        _source: synced.includes(s.id) ? 'synced' : 'local',
        _localId: s.id,
      });
    });

    // Add backend sessions that aren't already represented locally
    // Match by startTime proximity (within 5 seconds) and lap count
    backendSessions.forEach((bs) => {
      const isDuplicate = localSessions.some((ls) => {
        const bsStart = new Date(bs.startedAt || bs.started_at || bs.created_at).getTime();
        const lsStart = new Date(ls.startTime || ls.createdAt).getTime();
        return Math.abs(bsStart - lsStart) < 5000 && ls.lapCount === (bs.lapCount || bs.lap_count || 0);
      });

      if (!isDuplicate) {
        // Normalize backend session to local format for display
        merged.push({
          id: bs.id,
          createdAt: bs.startedAt || bs.started_at || bs.created_at || bs.createdAt,
          startTime: bs.startedAt || bs.started_at,
          endTime: bs.endedAt || bs.ended_at || null,
          lapCount: bs.lapCount || bs.lap_count || 0,
          totalSeconds: bs.totalDuration || bs.total_duration || 0,
          totalAmount: bs.totalAmount || bs.total_amount || 0,
          sessionName: bs.sessionName || bs.session_name || '',
          description: bs.description || '',
          isCompleted: bs.isCompleted ?? bs.is_completed ?? true,
          laps: [], // Laps will be loaded on expand
          _source: 'backend',
          _backendId: bs.id,
        });
      }
    });

    // Sort by date (newest first)
    merged.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.startTime).getTime();
      const dateB = new Date(b.createdAt || b.startTime).getTime();
      return dateB - dateA;
    });

    setMergedSessions(merged);
  }, [localSessions, backendSessions]);

  // Handle expanding a session — load laps from backend if needed
  const handleExpand = async (sessionId, session) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }

    setExpandedSession(sessionId);

    // If backend session with no local laps, fetch from backend
    if (session._source === 'backend' && (!session.laps || session.laps.length === 0)) {
      setLoadingLaps(sessionId);
      try {
        // Try fetching session detail (might include laps)
        const detail = await fetchSessionDetail(sessionId);
        if (detail && detail.laps && detail.laps.length > 0) {
          setExpandedLaps((prev) => ({ ...prev, [sessionId]: detail.laps }));
        } else {
          // Try fetching laps separately
          const laps = await fetchSessionLaps(sessionId);
          if (laps && Array.isArray(laps)) {
            setExpandedLaps((prev) => ({ ...prev, [sessionId]: laps }));
          } else if (laps && laps.laps && Array.isArray(laps.laps)) {
            setExpandedLaps((prev) => ({ ...prev, [sessionId]: laps.laps }));
          }
        }
      } catch (err) {
        console.warn('[Sessions] Failed to load laps for session:', sessionId, err);
      }
      setLoadingLaps(null);
    }

    // For local sessions, load images for each lap
    if (session._source !== 'backend' && session.laps) {
      const imgMap = {};
      session.laps.forEach((lap) => {
        if (lap.id) {
          const imgs = getImages(lap.id);
          if (imgs.length > 0) {
            imgMap[lap.id] = imgs;
          }
        }
      });
      setExpandedImages((prev) => ({ ...prev, ...imgMap }));
    }
  };

  const handleSyncSession = async (session) => {
    if (!loggedIn || syncingId) return;
    setSyncingId(session.id);
    const result = await syncSessionToBackend(session);
    if (result) {
      setSyncedIds(getSyncedSessionIds());
    }
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!loggedIn) return;
    for (const session of localSessions) {
      if (!syncedIds.includes(session.id)) {
        await handleSyncSession(session);
      }
    }
  };

  const handleDelete = async (id, source) => {
    if (source === 'backend') {
      // Delete from backend
      await deleteBackendSession(id);
      setBackendSessions((prev) => prev.filter((s) => s.id !== id));
    } else {
      // Delete from localStorage
      deleteSession(id);
      setLocalSessions(getSessions());
    }
  };

  const handleClearAll = () => {
    clearAllSessions();
    setLocalSessions([]);
    setShowConfirmClear(false);
  };

  const formatDuration = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString || '—';
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Get the laps to display for a session (local or backend)
  const getSessionLaps = (session) => {
    if (session._source === 'backend') {
      return expandedLaps[session.id] || [];
    }
    return session.laps || [];
  };

  // Normalize a backend lap to a display-friendly format
  const normalizeLap = (lap, source) => {
    if (source === 'backend') {
      return {
        id: lap.id,
        startTime: lap.startedAt || lap.started_at || lap.startTime || '—',
        endTime: lap.endedAt || lap.ended_at || lap.endTime || '—',
        current_hours: lap.hours || Math.floor((lap.duration || 0) / 3600),
        current_minutes: lap.minutes || Math.floor(((lap.duration || 0) % 3600) / 60),
        current_seconds: lap.seconds || Math.round((lap.duration || 0) % 60),
        workDoneString: lap.lapName || lap.lap_name || lap.workDoneString || '',
        isBreakLap: lap.isBreakLap || lap.is_break_lap || false,
        HourlyAmount: lap.hourlyAmount || lap.hourly_amount || lap.HourlyAmount || 0,
      };
    }
    return lap;
  };

  // Source badge component
  const SourceBadge = ({ source }) => {
    if (source === 'backend') {
      return (
        <span className="badge badge-sm badge-info gap-1" title="Stored in cloud">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
          Cloud
        </span>
      );
    }
    if (source === 'synced') {
      return (
        <span className="badge badge-sm badge-success gap-1" title="Synced to cloud">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Synced
        </span>
      );
    }
    return (
      <span className="badge badge-sm badge-ghost gap-1" title="Local only">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        Local
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-base-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="btn btn-ghost btn-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </Link>
            <h1 className="text-3xl font-bold">Previous Sessions</h1>
            {backendLoading && (
              <span className="loading loading-spinner loading-sm text-info"></span>
            )}
          </div>
          {mergedSessions.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Refresh from backend */}
              {loggedIn && (
                <button
                  className="btn btn-sm btn-outline btn-ghost"
                  onClick={loadBackendSessions}
                  disabled={backendLoading}
                  title="Refresh from cloud"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={backendLoading ? 'animate-spin' : ''}>
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              )}
              {/* Sync All to backend button (only shown when logged in) */}
              {loggedIn && (
                <button
                  className={`btn btn-sm btn-outline btn-info ${
                    !backendOnline ? 'btn-disabled' : ''
                  }`}
                  onClick={handleSyncAll}
                  disabled={!backendOnline || syncingId}
                  title={
                    !backendOnline
                      ? 'Server offline'
                      : 'Sync all unsynced sessions to cloud'
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  Sync All
                </button>
              )}
              {/* Export All dropdown */}
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-sm btn-outline btn-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export All
                </div>
                <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] w-40 p-2 shadow-lg border border-base-300">
                  <li><a onClick={() => exportAllSessionsCSV(mergedSessions)}>CSV</a></li>
                  <li><a onClick={() => exportAllSessionsJSON(mergedSessions)}>JSON</a></li>
                  <li><a onClick={() => exportAllSessionsPDF(mergedSessions)}>PDF</a></li>
                </ul>
              </div>

              {showConfirmClear ? (
                <div className="flex gap-2">
                  <button className="btn btn-sm btn-error" onClick={handleClearAll}>
                    Confirm Clear All
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowConfirmClear(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-sm btn-outline btn-error"
                  onClick={() => setShowConfirmClear(true)}
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>

        {mergedSessions.length === 0 && !backendLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-40">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <p className="text-xl mb-2">No sessions yet</p>
            <p className="text-sm">Sessions are saved when you press the stop button.</p>
            {loggedIn && (
              <p className="text-sm mt-2 text-info">Your cloud sessions will appear here once loaded.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mergedSessions.map((session) => (
              <div
                key={session.id}
                className="bg-base-200/50 rounded-2xl border border-base-300 overflow-hidden transition-all hover:border-primary/30"
              >
                {/* Session header - clickable to expand */}
                <div
                  className="cursor-pointer"
                  onClick={() => handleExpand(session.id, session)}
                >
                  <div className="flex items-center justify-between p-4 md:p-5">
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-primary/50">
                        {mergedSessions.indexOf(session) + 1}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">
                            {session.sessionName || formatDate(session.createdAt)}
                          </span>
                          <SourceBadge source={session._source} />
                          {/* Show if session is in-progress */}
                          {session.isCompleted === false && (
                            <span className="badge badge-sm badge-warning">In Progress</span>
                          )}
                        </div>
                        <span className="text-sm text-base-content/50">
                          {session.lapCount} lap{session.lapCount !== 1 ? 's' : ''}
                          {session.sessionName && (
                            <span className="ml-2">• {formatDate(session.createdAt)}</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-base-content/50">Duration</span>
                        <span className="font-bold text-secondary tabular-nums">
                          {formatDuration(session.totalSeconds)}
                        </span>
                      </div>
                      {session.totalAmount > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-base-content/50">Earned</span>
                          <span className="font-bold text-success">
                            ₹{(session.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {/* Sync status / button for local-only sessions */}
                        {loggedIn && session._source === 'local' && (
                          <button
                            className={`btn btn-ghost btn-sm btn-circle text-info/50 hover:text-info ${
                              syncingId === session.id ? 'loading' : ''
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncSession(session);
                            }}
                            disabled={!backendOnline || syncingId}
                            title="Sync to cloud"
                          >
                            {syncingId === session.id ? (
                              <span className="loading loading-spinner loading-xs"></span>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 16 12 12 8 16" />
                                <line x1="12" y1="12" x2="12" y2="21" />
                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                              </svg>
                            )}
                          </button>
                        )}
                        {/* Per-session export dropdown */}
                        <div className="dropdown dropdown-end" onClick={(e) => e.stopPropagation()}>
                          <div tabIndex={0} role="button" className="btn btn-ghost btn-sm btn-circle text-primary/50 hover:text-primary" title="Export this session">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          </div>
                          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] w-32 p-2 shadow-lg border border-base-300">
                            <li><a onClick={() => exportSessionCSV(session)}>CSV</a></li>
                            <li><a onClick={() => exportSessionJSON(session)}>JSON</a></li>
                            <li><a onClick={() => exportSessionPDF(session)}>PDF</a></li>
                          </ul>
                        </div>
                        <button
                          className="btn btn-ghost btn-sm btn-circle text-error/50 hover:text-error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(session.id, session._source);
                          }}
                          title="Delete session"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${expandedSession === session.id ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded session details */}
                {expandedSession === session.id && (
                  <div className="border-t border-base-300 p-4">
                    {loadingLaps === session.id ? (
                      <div className="flex items-center justify-center py-8 gap-2">
                        <span className="loading loading-spinner loading-md text-info"></span>
                        <span className="text-base-content/50">Loading laps from cloud...</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        {(() => {
                          const laps = getSessionLaps(session);
                          if (laps.length === 0) {
                            return (
                              <div className="text-center py-4 text-base-content/40">
                                No lap data available for this session.
                              </div>
                            );
                          }
                          // Show in chronological order (reverse since stored newest-first for local)
                          const displayLaps = session._source === 'backend' ? laps : [...laps].reverse();
                          return (
                            <table className="table table-sm">
                              <thead>
                                <tr className="text-sm">
                                  <th>#</th>
                                  <th>Start</th>
                                  <th>End</th>
                                  <th>Duration</th>
                                  <th>Work Done</th>
                                  <th>Break</th>
                                  <th>Images</th>
                                </tr>
                              </thead>
                              <tbody>
                                {displayLaps.map((rawLap, i) => {
                                  const lap = normalizeLap(rawLap, session._source);
                                  const totalSec =
                                    (lap.current_hours || 0) * 3600 +
                                    (lap.current_minutes || 0) * 60 +
                                    (lap.current_seconds || 0);
                                  const lapImages = expandedImages[lap.id] || getImages(lap.id);
                                  return (
                                    <tr key={lap.id || i} className="text-sm">
                                      <td className="font-medium">{i + 1}</td>
                                      <td className="text-base-content/70">
                                        {typeof lap.startTime === 'string' ? lap.startTime : '—'}
                                      </td>
                                      <td className="text-base-content/70">
                                        {lap.endTime === 0 ? 'DNF' : (typeof lap.endTime === 'string' ? lap.endTime : '—')}
                                      </td>
                                      <td className="font-medium text-secondary tabular-nums">
                                        {formatDuration(totalSec)}
                                      </td>
                                      <td className="max-w-xs">
                                        <div className="whitespace-pre-wrap break-words text-base-content/80">
                                          {lap.workDoneString || '—'}
                                        </div>
                                      </td>
                                      <td>
                                        {lap.isBreakLap && (
                                          <span className="badge badge-warning badge-sm">Break</span>
                                        )}
                                      </td>
                                      <td>
                                        {lapImages && lapImages.length > 0 ? (
                                          <div className="flex gap-1 flex-wrap">
                                            {lapImages.map((img, imgIdx) => (
                                              <img
                                                key={imgIdx}
                                                src={img}
                                                alt={`Lap ${i + 1} attachment ${imgIdx + 1}`}
                                                className="w-10 h-10 object-cover rounded border border-base-300 cursor-pointer hover:border-primary transition-colors"
                                                onClick={() => setPreviewImage(img)}
                                              />
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-base-content/30 text-xs">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                        {/* Note for backend-only sessions about images */}
                        {session._source === 'backend' && (
                          <div className="text-xs text-base-content/30 mt-2 italic">
                            Images are stored locally and not synced to cloud. Only sessions recorded on this device will show images.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
            />
            <button
              className="absolute -top-3 -right-3 btn btn-circle btn-sm btn-error"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
