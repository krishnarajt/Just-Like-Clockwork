// importing basics
import { useContext, useEffect, useState } from 'react';

// importing contexts
import { LapContext } from '../context/LapContext';
import { AuthContext } from '../context/AuthContext';

// importing components
import Footer from '../components/Footer';
import Statistics from '../components/Statistics';
import TimerDisplay from '../components/TimerDisplay';
import LapCardList from '../components/LapCard';
import ControlButtons from '../components/ControlButtons';

// importing api functions
import {
  isLoggedIn,
  fetchBackendSessions,
  fetchSessionDetail,
  fetchSessionLaps,
} from '../utils/apiClient';
import WorkLap from '../classes/WorkLapClass';

const Home = () => {
  const {
    laps,
    setLaps,
    updateWorkDoneByID,
    showStatsBeforeLaps,
    minimalistMode,
    isPlaying,
    setIsPlaying,
    started,
    setStarted,
    clearTimer,
    setClearTimer,
    clearLapTimer,
    setClearLapTimer,
    activeLapId,
    setActiveLapId,
  } = useContext(LapContext);

  const { loggedIn, backendOnline } = useContext(AuthContext);
  const [restoredSession, setRestoredSession] = useState(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (laps.length > 0 && !activeLapId) {
      setActiveLapId(laps[0].getId());
    }
  }, [laps, activeLapId, setActiveLapId]);

  // On page load, if logged in and no active session locally, check backend for in-progress session
  useEffect(() => {
    if (!loggedIn || !backendOnline || laps.length > 0 || started) return;

    const checkForInProgressSession = async () => {
      try {
        const result = await fetchBackendSessions(10, 0);
        let sessions = [];
        if (result && Array.isArray(result)) {
          sessions = result;
        } else if (result && result.sessions && Array.isArray(result.sessions)) {
          sessions = result.sessions;
        }

        // Find the most recent uncompleted session
        const inProgress = sessions.find((s) => {
          const completed = s.isCompleted ?? s.is_completed ?? true;
          return !completed;
        });

        if (inProgress) {
          // Fetch its laps
          let sessionLaps = [];
          const detail = await fetchSessionDetail(inProgress.id);
          if (detail && detail.laps && detail.laps.length > 0) {
            sessionLaps = detail.laps;
          } else {
            const lapsResult = await fetchSessionLaps(inProgress.id);
            if (lapsResult && Array.isArray(lapsResult)) {
              sessionLaps = lapsResult;
            } else if (lapsResult && lapsResult.laps) {
              sessionLaps = lapsResult.laps;
            }
          }

          if (sessionLaps.length > 0) {
            setRestoredSession({
              ...inProgress,
              laps: sessionLaps,
            });
            setShowRestoreBanner(true);
          }
        }
      } catch (err) {
        console.warn('[Home] Failed to check for in-progress sessions:', err);
      }
    };

    checkForInProgressSession();
  }, [loggedIn, backendOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore session from backend
  const handleRestoreSession = () => {
    if (!restoredSession || !restoredSession.laps) return;
    setRestoring(true);

    try {
      // Convert backend laps to WorkLap objects (all completed/paused)
      const restoredLaps = restoredSession.laps.map((lap) => {
        const startTime = lap.startedAt || lap.started_at || lap.startTime || new Date().toLocaleString();
        const endTime = lap.endedAt || lap.ended_at || lap.endTime || new Date().toLocaleString();
        const duration = lap.duration || 0;
        const hours = lap.hours || Math.floor(duration / 3600);
        const minutes = lap.minutes || Math.floor((duration % 3600) / 60);
        const seconds = lap.seconds || Math.round(duration % 60);
        const workDone = lap.lapName || lap.lap_name || lap.workDoneString || '';
        const hourlyAmount = lap.hourlyAmount || lap.hourly_amount || lap.HourlyAmount || 0;

        const workLap = new WorkLap(startTime, endTime, hours, minutes, seconds, workDone, hourlyAmount);
        workLap.setIsBreakLap(lap.isBreakLap || lap.is_break_lap || false);
        return workLap;
      });

      // Reverse to newest-first (backend likely stores chronologically)
      restoredLaps.reverse();

      setLaps(restoredLaps);
      setShowRestoreBanner(false);
      // Don't auto-start — session is paused
    } catch (err) {
      console.warn('[Home] Failed to restore session:', err);
    }
    setRestoring(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Restore banner for in-progress backend session */}
      {showRestoreBanner && restoredSession && (
        <div className="mx-auto w-full max-w-4xl px-4 mt-2">
          <div className="alert alert-info shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
            <div className="flex flex-col">
              <span className="font-semibold">In-progress session found in cloud</span>
              <span className="text-sm">
                {restoredSession.laps?.length || 0} laps from{' '}
                {(() => {
                  try {
                    const d = new Date(restoredSession.startedAt || restoredSession.started_at);
                    return isNaN(d.getTime()) ? 'another device' : d.toLocaleDateString();
                  } catch {
                    return 'another device';
                  }
                })()}
                . Restore it here as a paused session?
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className={`btn btn-sm btn-primary ${restoring ? 'loading' : ''}`}
                onClick={handleRestoreSession}
                disabled={restoring}
              >
                Restore
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowRestoreBanner(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      <TimerDisplay
        isPlaying={isPlaying}
        clearLapTimer={clearLapTimer}
        setClearLapTimer={setClearLapTimer}
        clearTimer={clearTimer}
        setClearTimer={setClearTimer}
        lap={activeLapId}
        enlarged={minimalistMode}
      />

      {/* Buttons */}
      <ControlButtons
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        started={started}
        setStarted={setStarted}
        clearTimer={clearTimer}
        setClearTimer={setClearTimer}
        clearLapTimer={clearLapTimer}
        setClearLapTimer={setClearLapTimer}
        lap={activeLapId}
        setLap={setActiveLapId}
      />

      {showStatsBeforeLaps && <Statistics />}

      {/* Lap Cards */}
      <LapCardList updateWorkDoneByID={updateWorkDoneByID} />

      {!showStatsBeforeLaps && <Statistics />}
      <Footer />
    </div>
  );
};

export default Home;
