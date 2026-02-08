// importing basics
import { useContext, useEffect } from 'react';

// importing contexts
import { LapContext } from '../context/LapContext';

// importing components
import Footer from '../components/Footer';
import Statistics from '../components/Statistics';
import TimerDisplay from '../components/TimerDisplay';
import LapCardList from '../components/LapCard';
import ControlButtons from '../components/ControlButtons';

const Home = () => {
  const {
    laps,
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

  useEffect(() => {
    if (laps.length > 0 && !activeLapId) {
      setActiveLapId(laps[0].getId());
    }
  }, [laps, activeLapId, setActiveLapId]);

  return (
    <div className="min-h-screen flex flex-col">
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
