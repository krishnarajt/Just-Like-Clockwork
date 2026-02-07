import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, deleteSession, clearAllSessions } from '../utils/sessionStore';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    setSessions(getSessions());
  }, []);

  const handleDelete = (id) => {
    deleteSession(id);
    setSessions(getSessions());
  };

  const handleClearAll = () => {
    clearAllSessions();
    setSessions([]);
    setShowConfirmClear(false);
  };

  const formatDuration = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
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
          </div>
          {sessions.length > 0 && (
            <div>
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

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-40">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <p className="text-xl mb-2">No sessions yet</p>
            <p className="text-sm">Sessions are saved when you press the stop button.</p>
            <Link to="/" className="btn btn-primary btn-sm mt-4">
              Start a Session
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-2xl border border-base-300 bg-base-200/30 overflow-hidden transition-all"
              >
                {/* Session header */}
                <div
                  className="p-5 cursor-pointer hover:bg-base-200/60 transition-colors"
                  onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-lg font-semibold">
                          {formatDate(session.createdAt)}
                        </span>
                        <span className="text-sm text-base-content/50">
                          {session.lapCount} lap{session.lapCount !== 1 ? 's' : ''}
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
                            ₹{session.totalAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-ghost btn-sm btn-circle text-error/50 hover:text-error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(session.id);
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
                    <div className="overflow-x-auto">
                      <table className="table table-sm">
                        <thead>
                          <tr className="text-sm">
                            <th>#</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Duration</th>
                            <th>Work Done</th>
                            <th>Break</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Show in chronological order (reverse since stored newest-first) */}
                          {[...session.laps].reverse().map((lap, i) => {
                            const totalSec =
                              (lap.current_hours || 0) * 3600 +
                              (lap.current_minutes || 0) * 60 +
                              (lap.current_seconds || 0);
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
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
