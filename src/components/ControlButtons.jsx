import { PlayButton } from '../components/ui/PlayButton';
import { PauseButton } from '../components/ui/PauseButton';
import { StopButton } from '../components/ui/StopButton';
import { LapIcon } from '../components/ui/LapIcon';
import WorkLap from '../classes/WorkLapClass';

import PropTypes from 'prop-types';
import { useState, useContext } from 'react';
import { LapContext } from '../context/LapContext';
import { AuthContext } from '../context/AuthContext';
import { StartButton } from './ui/StartButton';
import { saveSession, getSessions } from '../utils/sessionStore';
import {
  isLoggedIn,
  startLiveSessionSync,
  stopLiveSessionSync,
  addLapToLiveSession,
  completeLiveSession,
  syncCurrentSessionToBackend,
  clearLiveSessionState,
  syncSessionToBackend,
} from '../utils/apiClient';
import { showToast } from '../utils/toast';

export default function ControlButtons({
  setClearLapTimer,
  setClearTimer,
  lap,
  started,
  setStarted,
  isPlaying,
  setIsPlaying,
  setLap,
}) {
  const [syncing, setSyncing] = useState(false);
  const { loggedIn, backendOnline } = useContext(AuthContext);

  const addNewLap = () => {
    const currentDate = new Date().toLocaleString();
    const newlap = new WorkLap(currentDate, 0, 0, 0, 0, '', 0);
    addLap(newlap);
    return newlap.id;
  };
  const { laps, addLap, resetLaps, getLapFromId, updateEndTime } = useContext(LapContext);

  // Sync current session to backend (manual sync button)
  const handleSyncCurrentSession = async () => {
    if (!isLoggedIn() || syncing || laps.length === 0) return;
    setSyncing(true);
    try {
      const result = await syncCurrentSessionToBackend(laps);
      if (result) {
        showToast('Session synced to cloud', 'success');
      } else {
        showToast('Sync failed — will retry later', 'warning');
      }
    } catch {
      showToast('Sync failed', 'error');
    }
    setSyncing(false);
  };

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="w-full justify-center flex gap-4">
        <button
          disabled={
            !started ||
            (getLapFromId(lap)?.getCurrentHours() === 0 && getLapFromId(lap)?.getCurrentMinutes() === 0)
          }
          onClick={() => {
            // End the current lap
            updateEndTime(lap, new Date().toLocaleString());

            // Sync the just-completed lap to backend (non-blocking)
            if (isLoggedIn()) {
              const completedLap = getLapFromId(lap);
              if (completedLap) {
                addLapToLiveSession({
                  id: completedLap.id,
                  startTime: completedLap.startTime,
                  endTime: completedLap.endTime,
                  current_hours: completedLap.current_hours,
                  current_minutes: completedLap.current_minutes,
                  current_seconds: completedLap.current_seconds,
                  workDoneString: completedLap.workDoneString,
                  isBreakLap: completedLap.isBreakLap,
                  HourlyAmount: completedLap.HourlyAmount,
                }).catch(() => {
                  console.log('[Sync] Lap sync failed, will retry on next sync');
                });
              }
            }

            setIsPlaying(false);
            const new_lap_id = addNewLap();
            setLap(new_lap_id);
            setClearLapTimer(true);
            setTimeout(() => {
              setIsPlaying(true);
            }, 500);
          }}
        >
          <LapIcon
            className={`w-24 h-24 ${
              !(
                !started ||
                (getLapFromId(lap)?.getCurrentHours() === 0 &&
                  getLapFromId(lap)?.getCurrentMinutes() === 0)
              )
                ? 'text-base-content transition-all duration-300 hover:text-primary hover:scale-90'
                : 'text-base-content/30 cursor-not-allowed'
            }`}
          />
        </button>
        <button
          disabled={!started}
          onClick={() => {
            setTimeout(() => {
              setIsPlaying(!isPlaying);
            }, 100);
          }}
        >
          {isPlaying ? (
            <PauseButton
              className={`w-24 h-24 ${
                started
                  ? 'text-base-content transition-all duration-300 hover:text-primary'
                  : 'text-base-content/30 cursor-not-allowed'
              }`}
            />
          ) : (
            <PlayButton
              className={`w-24 h-24 ${
                started
                  ? 'text-base-content transition-all duration-300 hover:text-primary'
                  : 'text-base-content/30 cursor-not-allowed'
              }`}
            />
          )}
        </button>
        <button>
          {started === false ? (
            <StartButton
              className="w-24 h-24 text-accent transition-all duration-300 hover:text-primary hover:scale-90"
              onClick={() => {
                if (laps.length === 0) {
                  const new_lap_id = addNewLap();
                  setLap(new_lap_id);
                  setStarted(true);
                  setIsPlaying(true);
                } else {
                  setStarted(true);
                  // setIsPlaying(true);
                }
                // Start periodic live backup if logged in
                if (isLoggedIn()) {
                  startLiveSessionSync(() => laps);
                }
              }}
            />
          ) : (
            <StopButton
              className="w-24 h-24 text-error"
              onClick={() => {
                // End the current lap and save the session before clearing
                if (laps.length > 0) {
                  updateEndTime(lap, new Date().toLocaleString());
                  const sessionId = saveSession(laps);

                  // If logged in, complete the live session on backend (non-blocking)
                  if (isLoggedIn()) {
                    completeLiveSession(laps).then((backendId) => {
                      if (!backendId) {
                        // Fallback: sync as a completed session the old way
                        const sessions = getSessions();
                        const savedSession = sessions.find((s) => s.id === sessionId);
                        if (savedSession) {
                          syncSessionToBackend(savedSession).catch(() => {
                            console.log('[Sync] Session queued for later sync');
                          });
                        }
                      }
                    }).catch(() => {
                      console.log('[Sync] Live session completion failed, trying fallback');
                      const sessions = getSessions();
                      const savedSession = sessions.find((s) => s.id === sessionId);
                      if (savedSession) {
                        syncSessionToBackend(savedSession).catch(() => {});
                      }
                    });
                  }
                }
                // Stop the live session sync
                stopLiveSessionSync();
                clearLiveSessionState();
                setStarted(false);
                setIsPlaying(false);
                setClearTimer(true);
                resetLaps();
              }}
            />
          )}
        </button>
      </div>
      {/* Sync to Cloud button — shown when session is active and user is logged in */}
      {started && loggedIn && laps.length > 0 && (
        <button
          className={`btn btn-xs btn-outline btn-info gap-1 ${syncing ? 'loading' : ''}`}
          onClick={handleSyncCurrentSession}
          disabled={syncing || !backendOnline}
          title={!backendOnline ? 'Server offline' : 'Sync current session to cloud for cross-browser access'}
        >
          {syncing ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          )}
          Sync to Cloud
        </button>
      )}
    </div>
  );
}

// props validation
ControlButtons.propTypes = {
  setClearLapTimer: PropTypes.func.isRequired,
  setClearTimer: PropTypes.func.isRequired,
  lap: PropTypes.string.isRequired,
  started: PropTypes.bool.isRequired,
  setStarted: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  setIsPlaying: PropTypes.func.isRequired,
  setLap: PropTypes.func.isRequired,
};
