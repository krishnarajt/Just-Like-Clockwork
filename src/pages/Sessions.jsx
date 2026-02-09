import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, deleteSession, clearAllSessions } from '../utils/sessionStore';
import {
  getSyncedSessionIds,
  syncSessionToBackend,
  isLoggedIn,
  fetchBackendSessions,
  fetchSessionDetail,
  fetchSessionLaps,
  fetchSessionImages,
  deleteBackendSession,
  updateSessionOnBackend,
  updateLapOnBackend,
  uploadImageToBackend,
} from '../utils/apiClient';
import { AuthContext } from '../context/AuthContext';
import { getImages, addImage, removeImage } from '../utils/imageStore';
import {
  exportSessionCSV,
  exportSessionJSON,
  exportSessionPDF,
  exportAllSessionsCSV,
  exportAllSessionsJSON,
  exportAllSessionsPDF,
} from '../components/export/to_session';
import { showToast } from '../utils/toast';

// ============ Inline Editable Text Component ============
function InlineEdit({ value, onSave, placeholder, className = '', inputClassName = '', multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-base-300/50 rounded px-1 -mx-1 transition-colors ${className}`}
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="Click to edit"
      >
        {value || <span className="text-base-content/30 italic">{placeholder}</span>}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
        onClick={(e) => e.stopPropagation()}
        className={`textarea textarea-bordered textarea-sm w-full ${inputClassName}`}
        placeholder={placeholder}
        rows={2}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
      }}
      onClick={(e) => e.stopPropagation()}
      className={`input input-bordered input-sm ${inputClassName}`}
      placeholder={placeholder}
    />
  );
}

// ============ Lap Edit Modal ============
function LapEditModal({ session, laps, onClose, onLapUpdate, onImageAdd }) {
  const [previewImage, setPreviewImage] = useState(null);
  const [localLapImages, setLocalLapImages] = useState({}); // lapId -> images
  const fileInputRefs = useRef({});

  // Load images for all laps
  useEffect(() => {
    const imgMap = {};
    laps.forEach((lap) => {
      const lapId = lap.id || lap.lapUuid || lap.lap_uuid;
      if (lapId) {
        // For local sessions, load from localStorage
        const localImgs = getImages(String(lapId));
        // For backend sessions, images come as part of lap data
        const backendImgs = (lap.images || []).map((img) => img.url || img.presignedUrl).filter(Boolean);
        imgMap[lapId] = [...localImgs, ...backendImgs];
      }
    });
    setLocalLapImages(imgMap);
  }, [laps]);

  const handleFileUpload = (lapId, e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);

        // Save to localStorage
        addImage(String(lapId), compressed);
        // Update local state
        setLocalLapImages((prev) => ({
          ...prev,
          [lapId]: [...(prev[lapId] || []), compressed],
        }));

        // If backend session, also upload to backend
        if (session._source === 'backend' && session._backendId) {
          uploadImageToBackend(session._backendId, lap.id, compressed, `image_${Date.now()}.jpg`).catch(() => {
            console.warn('[Sessions] Failed to upload image to backend');
          });
        }

        if (onImageAdd) onImageAdd(lapId, compressed);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (lapId, index) => {
    // Only remove from localStorage images, not backend presigned URLs
    const localImgs = getImages(String(lapId));
    if (index < localImgs.length) {
      removeImage(String(lapId), index);
    }
    setLocalLapImages((prev) => {
      const imgs = [...(prev[lapId] || [])];
      imgs.splice(index, 1);
      return { ...prev, [lapId]: imgs };
    });
  };

  const formatDuration = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  // Normalize lap for display
  const normalizeLap = (lap) => {
    if (session._source === 'backend') {
      return {
        id: lap.id,
        lapUuid: lap.lapUuid || lap.lap_uuid,
        startTime: lap.startedAt || lap.started_at || lap.startTime || '—',
        endTime: lap.endedAt || lap.ended_at || lap.endTime || '—',
        current_hours: lap.hours || Math.floor((lap.duration || 0) / 3600),
        current_minutes: lap.minutes || Math.floor(((lap.duration || 0) % 3600) / 60),
        current_seconds: lap.seconds || Math.round((lap.duration || 0) % 60),
        workDoneString: lap.lapName || lap.lap_name || lap.workDoneString || '',
        isBreakLap: lap.isBreakLap || lap.is_break_lap || false,
        images: lap.images || [],
      };
    }
    return lap;
  };

  // Display laps chronologically
  const displayLaps = session._source === 'backend' ? laps : [...laps].reverse();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-base-300">
          <h2 className="text-xl font-bold">Edit Session Laps</h2>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>✕</button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
          {displayLaps.length === 0 && (
            <div className="text-center py-8 text-base-content/40">No laps in this session.</div>
          )}
          {displayLaps.map((rawLap, i) => {
            const lap = normalizeLap(rawLap);
            const lapId = lap.id || lap.lapUuid;
            const totalSec = (lap.current_hours || 0) * 3600 + (lap.current_minutes || 0) * 60 + (lap.current_seconds || 0);
            const images = localLapImages[lapId] || [];

            return (
              <div key={lapId || i} className={`rounded-xl border p-4 ${lap.isBreakLap ? 'border-warning/30 bg-warning/5' : 'border-base-300 bg-base-200/30'}`}>
                {/* Lap header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-primary">{i + 1}</span>
                    <span className="text-sm text-base-content/60">{typeof lap.startTime === 'string' ? lap.startTime : '—'}</span>
                    <span className="text-base-content/30">→</span>
                    <span className="text-sm text-base-content/60">{lap.endTime === 0 ? 'Running' : (typeof lap.endTime === 'string' ? lap.endTime : '—')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-secondary tabular-nums text-sm">{formatDuration(totalSec)}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span className="text-xs text-base-content/50">Break</span>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-warning"
                        checked={lap.isBreakLap || false}
                        onChange={(e) => {
                          // For backend sessions, update via API
                          if (session._source === 'backend' && session._backendId && lap.id) {
                            updateLapOnBackend(session._backendId, lap.id, { isBreakLap: e.target.checked }).catch(() => {});
                          }
                          onLapUpdate(lapId, { isBreakLap: e.target.checked });
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Work done textarea */}
                <textarea
                  className="textarea textarea-bordered w-full rounded-xl text-sm min-h-[4rem] resize-y"
                  placeholder="What did you work on?"
                  value={lap.workDoneString || ''}
                  onChange={(e) => {
                    onLapUpdate(lapId, { workDoneString: e.target.value });
                  }}
                  onBlur={(e) => {
                    // Save to backend on blur
                    if (session._source === 'backend' && session._backendId && lap.id) {
                      updateLapOnBackend(session._backendId, lap.id, { lapName: e.target.value }).catch(() => {});
                    }
                  }}
                  onPaste={(e) => {
                    // Handle image paste
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let j = 0; j < items.length; j++) {
                      if (items[j].type.startsWith('image/')) {
                        e.preventDefault();
                        const file = items[j].getAsFile();
                        if (file) handleFileUpload(lapId, { target: { files: [file], value: '' } });
                        break;
                      }
                    }
                  }}
                />

                {/* Images */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    className="btn btn-xs btn-ghost text-base-content/60 gap-1"
                    onClick={() => {
                      if (!fileInputRefs.current[lapId]) {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => handleFileUpload(lapId, e);
                        fileInputRefs.current[lapId] = input;
                      }
                      fileInputRefs.current[lapId].click();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Add Image
                  </button>

                  {images.map((img, imgIdx) => (
                    <div key={imgIdx} className="relative group cursor-pointer" onClick={() => setPreviewImage(img)}>
                      <img
                        src={img}
                        alt={`Lap ${i + 1} img ${imgIdx + 1}`}
                        className="w-12 h-12 object-cover rounded-lg border border-base-300 hover:border-primary transition-colors"
                      />
                      <button
                        className="absolute -top-1.5 -right-1.5 btn btn-circle btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleRemoveImage(lapId, imgIdx); }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal footer */}
        <div className="p-4 border-t border-base-300 flex justify-end">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>

      {/* Image preview */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] rounded-xl object-contain" />
            <button className="absolute -top-3 -right-3 btn btn-circle btn-sm btn-error" onClick={() => setPreviewImage(null)}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ============ Main Sessions Page ============
export default function Sessions() {
  const [localSessions, setLocalSessions] = useState([]);
  const [backendSessions, setBackendSessions] = useState([]);
  const [mergedSessions, setMergedSessions] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);
  const [expandedLaps, setExpandedLaps] = useState({}); // sessionId -> laps array (for backend sessions)
  const [loadingLaps, setLoadingLaps] = useState(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [syncedIds, setSyncedIds] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [editingSession, setEditingSession] = useState(null); // session to edit laps
  const [editingLaps, setEditingLaps] = useState([]); // laps for the editing modal
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
        setBackendSessions(result.sessions);
      }
    } catch (err) {
      console.warn('[Sessions] Failed to load backend sessions:', err);
    }
    setBackendLoading(false);
  }, [loggedIn, backendOnline]);

  useEffect(() => { loadBackendSessions(); }, [loadBackendSessions]);

  // Merge local and backend sessions
  useEffect(() => {
    const synced = getSyncedSessionIds();
    const merged = [];

    localSessions.forEach((s) => {
      merged.push({ ...s, _source: synced.includes(s.id) ? 'synced' : 'local', _localId: s.id });
    });

    backendSessions.forEach((bs) => {
      const isDuplicate = localSessions.some((ls) => {
        const bsStart = new Date(bs.startedAt || bs.started_at || bs.created_at).getTime();
        const lsStart = new Date(ls.startTime || ls.createdAt).getTime();
        return Math.abs(bsStart - lsStart) < 5000 && ls.lapCount === (bs.lapCount || bs.lap_count || 0);
      });

      if (!isDuplicate) {
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
          laps: [],
          _source: 'backend',
          _backendId: bs.id,
        });
      }
    });

    merged.sort((a, b) => new Date(b.createdAt || b.startTime).getTime() - new Date(a.createdAt || a.startTime).getTime());
    setMergedSessions(merged);
  }, [localSessions, backendSessions]);

  // Expand session — load laps
  const handleExpand = async (sessionId, session) => {
    if (expandedSession === sessionId) { setExpandedSession(null); return; }
    setExpandedSession(sessionId);

    if (session._source === 'backend' && (!session.laps || session.laps.length === 0)) {
      setLoadingLaps(sessionId);
      try {
        const detail = await fetchSessionDetail(sessionId);
        if (detail && detail.laps && detail.laps.length > 0) {
          setExpandedLaps((prev) => ({ ...prev, [sessionId]: detail.laps }));
        } else {
          const laps = await fetchSessionLaps(sessionId);
          if (laps && Array.isArray(laps)) setExpandedLaps((prev) => ({ ...prev, [sessionId]: laps }));
          else if (laps && laps.laps) setExpandedLaps((prev) => ({ ...prev, [sessionId]: laps.laps }));
        }
      } catch (err) { console.warn('[Sessions] Failed to load laps:', err); }
      setLoadingLaps(null);
    }
  };

  // Save session name/description
  const handleSessionNameSave = async (session, newName) => {
    if (session._source === 'backend') {
      await updateSessionOnBackend(session.id, { sessionName: newName });
    }
    // Update local merged state
    setMergedSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, sessionName: newName } : s));
  };

  const handleSessionDescSave = async (session, newDesc) => {
    if (session._source === 'backend') {
      await updateSessionOnBackend(session.id, { description: newDesc });
    }
    setMergedSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, description: newDesc } : s));
  };

  // Open edit modal for a session
  const handleOpenEditModal = async (session) => {
    let laps = [];
    if (session._source === 'backend') {
      // Fetch laps if not already loaded
      if (expandedLaps[session.id]) {
        laps = expandedLaps[session.id];
      } else {
        const detail = await fetchSessionDetail(session.id);
        if (detail && detail.laps) laps = detail.laps;
      }
    } else {
      laps = session.laps || [];
    }
    setEditingSession(session);
    setEditingLaps([...laps]);
  };

  // Handle lap update from modal
  const handleLapUpdate = (lapId, updates) => {
    setEditingLaps((prev) => prev.map((lap) => {
      const id = lap.id || lap.lapUuid || lap.lap_uuid;
      if (id === lapId) {
        return { ...lap, ...updates, lapName: updates.workDoneString !== undefined ? updates.workDoneString : lap.lapName };
      }
      return lap;
    }));
  };

  const handleSyncSession = async (session) => {
    if (!loggedIn || syncingId) return;
    setSyncingId(session.id);
    const result = await syncSessionToBackend(session);
    if (result) setSyncedIds(getSyncedSessionIds());
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!loggedIn) return;
    for (const session of localSessions) {
      if (!syncedIds.includes(session.id)) await handleSyncSession(session);
    }
  };

  const handleDelete = async (id, source) => {
    if (source === 'backend') {
      await deleteBackendSession(id);
      setBackendSessions((prev) => prev.filter((s) => s.id !== id));
    } else {
      deleteSession(id);
      setLocalSessions(getSessions());
    }
  };

  const handleClearAll = () => { clearAllSessions(); setLocalSessions([]); setShowConfirmClear(false); };

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
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
      }).format(d);
    } catch { return isoString; }
  };

  const getSessionLaps = (session) => {
    if (session._source === 'backend') return expandedLaps[session.id] || [];
    return session.laps || [];
  };

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
        images: lap.images || [],
      };
    }
    return lap;
  };

  // Source badge
  const SourceBadge = ({ source }) => {
    if (source === 'backend') return (
      <span className="badge badge-sm badge-info gap-1" title="Cloud">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
        Cloud
      </span>
    );
    if (source === 'synced') return (
      <span className="badge badge-sm badge-success gap-1" title="Synced">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Synced
      </span>
    );
    return (
      <span className="badge badge-sm badge-ghost gap-1" title="Local">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            </Link>
            <h1 className="text-3xl font-bold">Previous Sessions</h1>
            {backendLoading && <span className="loading loading-spinner loading-sm text-info"></span>}
          </div>
          {mergedSessions.length > 0 && (
            <div className="flex items-center gap-2">
              {loggedIn && (
                <button className="btn btn-sm btn-outline btn-ghost" onClick={loadBackendSessions} disabled={backendLoading} title="Refresh from cloud">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={backendLoading ? 'animate-spin' : ''}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
              )}
              {loggedIn && (
                <button className={`btn btn-sm btn-outline btn-info ${!backendOnline ? 'btn-disabled' : ''}`} onClick={handleSyncAll} disabled={!backendOnline || syncingId} title="Sync all to cloud">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                  Sync All
                </button>
              )}
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-sm btn-outline btn-primary">Export All</div>
                <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] w-40 p-2 shadow-lg border border-base-300">
                  <li><a onClick={() => exportAllSessionsCSV(mergedSessions)}>CSV</a></li>
                  <li><a onClick={() => exportAllSessionsJSON(mergedSessions)}>JSON</a></li>
                  <li><a onClick={() => exportAllSessionsPDF(mergedSessions)}>PDF</a></li>
                </ul>
              </div>
              {showConfirmClear ? (
                <div className="flex gap-2">
                  <button className="btn btn-sm btn-error" onClick={handleClearAll}>Confirm Clear</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowConfirmClear(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-sm btn-outline btn-error" onClick={() => setShowConfirmClear(true)}>Clear All</button>
              )}
            </div>
          )}
        </div>

        {mergedSessions.length === 0 && !backendLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-40"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <p className="text-xl mb-2">No sessions yet</p>
            <p className="text-sm">Sessions are saved when you press the stop button.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mergedSessions.map((session, idx) => (
              <div key={session.id} className="bg-base-200/50 rounded-2xl border border-base-300 overflow-hidden transition-all hover:border-primary/30">
                {/* Session header */}
                <div className="cursor-pointer" onClick={() => handleExpand(session.id, session)}>
                  <div className="flex items-center justify-between p-4 md:p-5">
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-primary/50">{idx + 1}</div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <InlineEdit
                            value={session.sessionName || formatDate(session.createdAt)}
                            onSave={(v) => handleSessionNameSave(session, v)}
                            placeholder="Session name..."
                            className="text-lg font-semibold"
                          />
                          <SourceBadge source={session._source} />
                          {session.isCompleted === false && <span className="badge badge-sm badge-warning">In Progress</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-base-content/50">
                            {session.lapCount} lap{session.lapCount !== 1 ? 's' : ''}
                          </span>
                          {session.description && (
                            <InlineEdit
                              value={session.description}
                              onSave={(v) => handleSessionDescSave(session, v)}
                              placeholder="Add description..."
                              className="text-xs text-base-content/40"
                            />
                          )}
                          {!session.description && session._source === 'backend' && (
                            <InlineEdit
                              value=""
                              onSave={(v) => handleSessionDescSave(session, v)}
                              placeholder="Add description..."
                              className="text-xs text-base-content/30"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-base-content/50">Duration</span>
                        <span className="font-bold text-secondary tabular-nums">{formatDuration(session.totalSeconds)}</span>
                      </div>
                      {session.totalAmount > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-base-content/50">Earned</span>
                          <span className="font-bold text-success">₹{(session.totalAmount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {/* Edit laps button */}
                        <button
                          className="btn btn-ghost btn-sm btn-circle text-base-content/40 hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); handleOpenEditModal(session); }}
                          title="Edit laps"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                          </svg>
                        </button>
                        {/* Sync button for local-only */}
                        {loggedIn && session._source === 'local' && (
                          <button
                            className={`btn btn-ghost btn-sm btn-circle text-info/50 hover:text-info`}
                            onClick={(e) => { e.stopPropagation(); handleSyncSession(session); }}
                            disabled={!backendOnline || syncingId}
                            title="Sync to cloud"
                          >
                            {syncingId === session.id ? (
                              <span className="loading loading-spinner loading-xs"></span>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                            )}
                          </button>
                        )}
                        {/* Export dropdown */}
                        <div className="dropdown dropdown-end" onClick={(e) => e.stopPropagation()}>
                          <div tabIndex={0} role="button" className="btn btn-ghost btn-sm btn-circle text-primary/50 hover:text-primary" title="Export">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </div>
                          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] w-32 p-2 shadow-lg border border-base-300">
                            <li><a onClick={() => exportSessionCSV(session)}>CSV</a></li>
                            <li><a onClick={() => exportSessionJSON(session)}>JSON</a></li>
                            <li><a onClick={() => exportSessionPDF(session)}>PDF</a></li>
                          </ul>
                        </div>
                        {/* Delete */}
                        <button
                          className="btn btn-ghost btn-sm btn-circle text-error/50 hover:text-error"
                          onClick={(e) => { e.stopPropagation(); handleDelete(session.id, session._source); }}
                          title="Delete session"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                        {/* Expand chevron */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expandedSession === session.id ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
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
                          if (laps.length === 0) return <div className="text-center py-4 text-base-content/40">No lap data available.</div>;

                          const displayLaps = session._source === 'backend' ? laps : [...laps].reverse();
                          return (
                            <table className="table table-sm">
                              <thead>
                                <tr className="text-sm">
                                  <th>#</th><th>Start</th><th>End</th><th>Duration</th><th>Work Done</th><th>Break</th><th>Images</th>
                                </tr>
                              </thead>
                              <tbody>
                                {displayLaps.map((rawLap, i) => {
                                  const lap = normalizeLap(rawLap, session._source);
                                  const totalSec = (lap.current_hours || 0) * 3600 + (lap.current_minutes || 0) * 60 + (lap.current_seconds || 0);
                                  // Combine local images + backend presigned URL images
                                  const localImgs = getImages(String(lap.id));
                                  const backendImgs = (lap.images || []).map((img) => img.url || img.presignedUrl).filter(Boolean);
                                  const allImages = [...localImgs, ...backendImgs];

                                  return (
                                    <tr key={lap.id || i} className="text-sm">
                                      <td className="font-medium">{i + 1}</td>
                                      <td className="text-base-content/70">{typeof lap.startTime === 'string' ? lap.startTime : '—'}</td>
                                      <td className="text-base-content/70">{lap.endTime === 0 ? 'DNF' : (typeof lap.endTime === 'string' ? lap.endTime : '—')}</td>
                                      <td className="font-medium text-secondary tabular-nums">{formatDuration(totalSec)}</td>
                                      <td className="max-w-xs"><div className="whitespace-pre-wrap break-words text-base-content/80">{lap.workDoneString || '—'}</div></td>
                                      <td>{lap.isBreakLap && <span className="badge badge-warning badge-sm">Break</span>}</td>
                                      <td>
                                        {allImages.length > 0 ? (
                                          <div className="flex gap-1 flex-wrap">
                                            {allImages.map((img, imgIdx) => (
                                              <img key={imgIdx} src={img} alt="" className="w-10 h-10 object-cover rounded border border-base-300 cursor-pointer hover:border-primary transition-colors" onClick={() => setPreviewImage(img)} />
                                            ))}
                                          </div>
                                        ) : <span className="text-base-content/30 text-xs">—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lap Edit Modal */}
      {editingSession && (
        <LapEditModal
          session={editingSession}
          laps={editingLaps}
          onClose={() => { setEditingSession(null); setEditingLaps([]); loadBackendSessions(); setLocalSessions(getSessions()); }}
          onLapUpdate={handleLapUpdate}
          onImageAdd={() => {}}
        />
      )}

      {/* Full image preview modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-3xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] rounded-xl object-contain" />
            <button className="absolute -top-3 -right-3 btn btn-circle btn-sm btn-error" onClick={() => setPreviewImage(null)}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
