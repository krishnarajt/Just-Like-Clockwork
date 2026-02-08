import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import getFromLocalStorage from '../components/import/from_local';
import saveToLocalStorage from '../components/export/to_local';
import WorkLap from '../classes/WorkLapClass';
import { playNotificationSound, showBrowserNotification } from '../utils/notification';

// Create the context
export const LapContext = createContext();

// Create a provider component
const LapProvider = ({ children }) => {
  let Laps = getFromLocalStorage() || [];
  const [laps, setLaps] = useState(Laps);

  const [breaksImpactAmount, setBreaksImpactAmount] = useState(false);
  const [breaksImpactTime, setBreaksImpactTime] = useState(false);
  const [showAmount, setShowAmount] = useState(true);
  const [showStatsBeforeLaps, setShowStatsBeforeLaps] = useState(false);
  const [minimalistMode, setMinimalistMode] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationIntervalHours, setNotificationIntervalHours] = useState(2);

  const [amount, setAmount] = useState(450);

  // --- Timer control state (lifted here so it persists across route/tab changes) ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [clearTimer, setClearTimer] = useState(false);
  const [clearLapTimer, setClearLapTimer] = useState(false);
  const [activeLapId, setActiveLapId] = useState('');

  // Notification timer ref
  const notificationTimerRef = useRef(null);

  function handleLapLocalUpdate(laps) {
    setLaps(laps);
  }

  // fetch the initial state from local storage
  useEffect(() => {
    const storedShowAmount = localStorage.getItem('showAmount');
    const storedShowStatsBeforeLaps = localStorage.getItem('showStatsBeforeLaps');
    const storedBreaksImpactAmount = localStorage.getItem('breaksImpactAmount');
    const storedBreaksImpactTime = localStorage.getItem('breaksImpactTime');
    const storedMinimalistMode = localStorage.getItem('minimalistMode');
    const storedNotificationEnabled = localStorage.getItem('notificationEnabled');
    const storedNotificationInterval = localStorage.getItem('notificationIntervalHours');
    const storedAmount = localStorage.getItem('hourlyAmount');

    setShowAmount(storedShowAmount ? JSON.parse(storedShowAmount) : true);
    setShowStatsBeforeLaps(storedShowStatsBeforeLaps ? JSON.parse(storedShowStatsBeforeLaps) : false);
    setBreaksImpactAmount(storedBreaksImpactAmount ? JSON.parse(storedBreaksImpactAmount) : false);
    setBreaksImpactTime(storedBreaksImpactTime ? JSON.parse(storedBreaksImpactTime) : false);
    setMinimalistMode(storedMinimalistMode ? JSON.parse(storedMinimalistMode) : false);
    setNotificationEnabled(storedNotificationEnabled !== null ? JSON.parse(storedNotificationEnabled) : true);
    setNotificationIntervalHours(storedNotificationInterval ? JSON.parse(storedNotificationInterval) : 2);
    if (storedAmount) setAmount(JSON.parse(storedAmount));
  }, []);

  // --- Notification timer logic ---
  useEffect(() => {
    // Clear any existing timer
    if (notificationTimerRef.current) {
      clearInterval(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }

    if (notificationEnabled && notificationIntervalHours > 0) {
      const intervalMs = notificationIntervalHours * 60 * 60 * 1000;
      notificationTimerRef.current = setInterval(() => {
        playNotificationSound();
        showBrowserNotification(
          'Just Like Clockwork',
          `Reminder: ${notificationIntervalHours} hour(s) have passed. Keep going!`
        );
      }, intervalMs);
    }

    return () => {
      if (notificationTimerRef.current) {
        clearInterval(notificationTimerRef.current);
      }
    };
  }, [notificationEnabled, notificationIntervalHours]);

  // Functions to update and persist state variables
  const updateShowAmount = (value) => {
    setShowAmount(value);
    localStorage.setItem('showAmount', JSON.stringify(value));
  };

  const updateShowStatsBeforeLaps = (value) => {
    setShowStatsBeforeLaps(value);
    localStorage.setItem('showStatsBeforeLaps', JSON.stringify(value));
  };

  const updateBreaksImpactAmount = (value) => {
    setBreaksImpactAmount(value);
    localStorage.setItem('breaksImpactAmount', JSON.stringify(value));
  };

  const updateBreaksImpactTime = (value) => {
    setBreaksImpactTime(value);
    localStorage.setItem('breaksImpactTime', JSON.stringify(value));
  };

  const updateMinimalistMode = (value) => {
    setMinimalistMode(value);
    localStorage.setItem('minimalistMode', JSON.stringify(value));
  };

  const updateNotificationEnabled = (value) => {
    setNotificationEnabled(value);
    localStorage.setItem('notificationEnabled', JSON.stringify(value));
  };

  const updateNotificationIntervalHours = (value) => {
    setNotificationIntervalHours(value);
    localStorage.setItem('notificationIntervalHours', JSON.stringify(value));
  };

  // Load laps from localStorage when the component mounts
  useEffect(() => {
    getFromLocalStorage(handleLapLocalUpdate);
  }, []);

  // Save laps to localStorage whenever they change
  useEffect(() => {
    saveToLocalStorage(laps);
  }, [laps]);

  // Keep activeLapId in sync with the newest lap
  useEffect(() => {
    if (laps.length > 0 && !activeLapId) {
      setActiveLapId(laps[0].getId());
    }
  }, [laps, activeLapId]);

  // Add a lap to the laps array
  const addLap = (lap) => {
    lap.setHourlyAmount(amount);
    // new lap at front (newest first)
    setLaps((prevLaps) => [lap, ...prevLaps]);
  };

  // Remove all laps
  const resetLaps = () => {
    setLaps([]);
  };

  // Get the first (newest) lap
  const getFirstLap = () => {
    return laps[0];
  };

  // Get lap from ID
  const getLapFromId = (id) => {
    return laps.find((lap) => lap.id === id);
  };

  // Update work done by ID
  const updateWorkDoneByID = (id, workDone) => {
    const newLaps = laps.map((lap) => {
      if (lap.id === id) {
        lap.setWorkDoneString(workDone);
      }
      return lap;
    });
    setLaps([...newLaps]);
  };

  // Update the amount
  const updateAmount = (newAmount) => {
    setAmount(newAmount);
    localStorage.setItem('hourlyAmount', JSON.stringify(newAmount));
  };

  // Update a lap's time
  const updateLap = (lapId, hours, minutes, seconds) => {
    const newLaps = laps.map((lap) => {
      if (lap.id === lapId) {
        lap.setCurrentHours(hours);
        lap.setCurrentMinutes(minutes);
        lap.setCurrentSeconds(seconds);
      }
      return lap;
    });
    setLaps(newLaps);
  };

  // --- Split a lap into two equal halves ---
  const splitLap = useCallback((lapId) => {
    setLaps((prevLaps) => {
      const index = prevLaps.findIndex((l) => l.id === lapId);
      if (index === -1) return prevLaps;

      const lap = prevLaps[index];

      // Don't split the currently active/running lap (endTime === 0 means still running)
      if (lap.endTime === 0) {
        // Import dynamically to avoid circular deps
        import('../utils/toast.js').then(({ showToast }) => {
          showToast('Cannot split the currently running lap. Finish or lap it first.', 'warning');
        });
        return prevLaps;
      }

      const totalSeconds = lap.getTotalTimeInSecondsRaw();
      if (totalSeconds < 2) {
        import('../utils/toast.js').then(({ showToast }) => {
          showToast('Lap is too short to split (needs at least 2 seconds).', 'warning');
        });
        return prevLaps;
      }

      const halfSeconds = Math.floor(totalSeconds / 2);
      const remainderSeconds = totalSeconds - halfSeconds;

      // Calculate hours/minutes/seconds for each half
      const h1 = Math.floor(halfSeconds / 3600);
      const m1 = Math.floor((halfSeconds % 3600) / 60);
      const s1 = halfSeconds % 60;

      const h2 = Math.floor(remainderSeconds / 3600);
      const m2 = Math.floor((remainderSeconds % 3600) / 60);
      const s2 = remainderSeconds % 60;

      // Calculate midpoint time for start/end times
      // Parse start time safely - try ISO first, then locale string
      let startMs;
      const startDate = new Date(lap.startTime);
      if (isNaN(startDate.getTime())) {
        // If parsing fails, use endTime minus totalSeconds as fallback
        const endDate = new Date(lap.endTime);
        startMs = endDate.getTime() - (totalSeconds * 1000);
      } else {
        startMs = startDate.getTime();
      }

      const halfMs = halfSeconds * 1000;
      const midMs = startMs + halfMs;
      const midDateStr = new Date(midMs).toLocaleString();

      // First half (same start, mid end)
      const lap1 = new WorkLap(
        lap.startTime,
        midDateStr,
        h1, m1, s1,
        lap.workDoneString,
        lap.HourlyAmount,
        uuidv4()
      );
      lap1.setIsBreakLap(lap.isBreakLap);

      // Second half (mid start, same end)
      const lap2 = new WorkLap(
        midDateStr,
        lap.endTime,
        h2, m2, s2,
        '', // Second half gets empty work done
        lap.HourlyAmount,
        uuidv4()
      );
      lap2.setIsBreakLap(lap.isBreakLap);

      // Laps are stored newest-first, so the "first half" is chronologically earlier (goes after)
      // and the "second half" is chronologically later (goes before/at same index)
      const newLaps = [...prevLaps];
      newLaps.splice(index, 1, lap2, lap1); // Replace original with: [newer half, older half]

      import('../utils/toast.js').then(({ showToast }) => {
        showToast('Lap split into two equal halves.', 'success');
      });

      return newLaps;
    });
  }, []);

  // --- Merge two adjacent laps ---
  const mergeLaps = useCallback((lapId1, lapId2) => {
    setLaps((prevLaps) => {
      const idx1 = prevLaps.findIndex((l) => l.id === lapId1);
      const idx2 = prevLaps.findIndex((l) => l.id === lapId2);
      if (idx1 === -1 || idx2 === -1) return prevLaps;

      const lap1 = prevLaps[idx1];
      const lap2 = prevLaps[idx2];

      // Don't merge if either lap is currently active (endTime === 0)
      if (lap1.endTime === 0 || lap2.endTime === 0) {
        import('../utils/toast.js').then(({ showToast }) => {
          showToast('Cannot merge with the currently running lap. Finish or lap it first.', 'warning');
        });
        return prevLaps;
      }

      // Determine which is chronologically earlier (higher index = older in newest-first array)
      const olderLap = idx1 > idx2 ? lap1 : lap2;
      const newerLap = idx1 > idx2 ? lap2 : lap1;
      const olderIdx = Math.max(idx1, idx2);
      const newerIdx = Math.min(idx1, idx2);

      // Merge times
      const totalSeconds = olderLap.getTotalTimeInSecondsRaw() + newerLap.getTotalTimeInSecondsRaw();
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      // Merge work done strings
      const workParts = [olderLap.workDoneString, newerLap.workDoneString].filter(Boolean);
      const mergedWork = workParts.join('\n');

      // Create merged lap with older's start and newer's end
      const mergedLap = new WorkLap(
        olderLap.startTime,
        newerLap.endTime,
        h, m, s,
        mergedWork,
        olderLap.HourlyAmount,
        uuidv4()
      );
      mergedLap.setIsBreakLap(olderLap.isBreakLap && newerLap.isBreakLap);

      // Remove both and insert merged at the newer position
      const newLaps = prevLaps.filter((_, i) => i !== olderIdx && i !== newerIdx);
      newLaps.splice(newerIdx, 0, mergedLap);

      import('../utils/toast.js').then(({ showToast }) => {
        showToast('Laps merged successfully.', 'success');
      });

      return newLaps;
    });
  }, []);

  // Calculate the total amount sum of all laps
  const getTotalAmountSum = () => {
    let totalAmount = 0.0;
    laps
      .filter((lap) => {
        if (breaksImpactAmount) {
          return !lap.isBreakLap; // Exclude break laps
        }
        return true; // Include all laps
      })
      .forEach((lap) => {
        totalAmount += parseFloat(lap.getAmount());
      });
    totalAmount = Math.round(totalAmount * 1000) / 1000;
    totalAmount = totalAmount.toFixed(3);
    return totalAmount;
  };

  // Calculate the total time spent in minutes
  const getTotalTimeSpent = () => {
    let totalMinutes = 0;
    laps
      .filter((lap) => {
        if (breaksImpactTime) {
          return !lap.isBreakLap;
        }
        return true;
      }).forEach((lap) => {
        totalMinutes += +lap.getTotalTimeInMinutes();
      });
    totalMinutes = Math.round(totalMinutes * 100) / 100;
    return totalMinutes;
  };

  // Calculate the total time spent in seconds
  const getTotalTimeSpentSeconds = () => {
    let totalSeconds = 0;
    laps
      .filter((lap) => {
        if (breaksImpactTime) {
          return !lap.isBreakLap;
        }
        return true;
      })
      .forEach((lap) => {
        totalSeconds += +lap.getTotalTimeInSeconds();
      });
    totalSeconds = Math.round(totalSeconds * 100) / 100;
    return totalSeconds;
  };

  // Calculate total time spent on breaks
  const getTotalBreakTimeSpentMinutes = () => {
    let totalBreakTime = 0;
    laps
      .filter((lap) => lap.isBreakLap)
      .forEach((lap) => {
        totalBreakTime += +lap.getTotalTimeInMinutes();
      });
    totalBreakTime = Math.round(totalBreakTime * 100) / 100;
    return totalBreakTime;
  };

  // function to update the end time for a lap
  const updateEndTime = (lapId, endTime) => {
    const newLaps = laps.map((lap) => {
      if (lap.id === lapId) {
        lap.setEndTime(endTime);
      }
      return lap;
    });
    setLaps(newLaps);
  };

  // Provide the context value to the children components
  return (
    <LapContext.Provider
      value={{
        laps,
        breaksImpactAmount,
        breaksImpactTime,
        setBreaksImpactAmount,
        setBreaksImpactTime,
        setLaps,
        addLap,
        resetLaps,
        updateLap,
        getFirstLap,
        getLapFromId,
        updateWorkDoneByID,
        updateAmount,
        updateEndTime,
        getTotalAmountSum,
        getTotalTimeSpent,
        getTotalTimeSpentSeconds,
        getTotalBreakTimeSpentMinutes,
        showAmount,
        setShowAmount,
        showStatsBeforeLaps,
        setShowStatsBeforeLaps,
        updateShowAmount,
        updateShowStatsBeforeLaps,
        updateBreaksImpactAmount,
        updateBreaksImpactTime,
        // New features
        splitLap,
        mergeLaps,
        minimalistMode,
        updateMinimalistMode,
        notificationEnabled,
        updateNotificationEnabled,
        notificationIntervalHours,
        updateNotificationIntervalHours,
        amount,
        // Timer control state (persists across route changes)
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
      }}
    >
      {children}
    </LapContext.Provider>
  );
};

export default LapProvider;
