import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useContext } from 'react';
import { LapContext } from '../context/LapContext';

const TimerContinuous = ({ isPlaying, clearTimer, setClearTimer, textClass = 'text-9xl' }) => {
  const [time, setTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const { getTotalTimeSpentSeconds } = useContext(LapContext);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setTime(() => {
          let time_spent = getTotalTimeSpentSeconds();

          let hours = Math.floor(time_spent / 3600);
          let minutes = Math.floor((time_spent - hours * 3600) / 60);
          let seconds = Math.floor(time_spent - hours * 3600 - minutes * 60);

          return {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          };
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }

    if (clearTimer) {
      setTime({ hours: 0, minutes: 0, seconds: 0 });
      setClearTimer(false);
    }

    return () => clearInterval(interval);
  }, [isPlaying, clearTimer, setClearTimer]);

  return (
    <div className={`${textClass} font-bold text-accent`}>
      {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}:
      {time.seconds.toString().padStart(2, '0')}
    </div>
  );
};

TimerContinuous.propTypes = {
  isPlaying: PropTypes.bool.isRequired,
  clearTimer: PropTypes.bool.isRequired,
  setClearTimer: PropTypes.func.isRequired,
  textClass: PropTypes.string,
};

export default TimerContinuous;
