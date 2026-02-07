import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const Timer = ({ lap, isPlaying, clearTimer, setClearTimer, UpdateCurrentWorkLapTime, textClass = 'text-9xl' }) => {

  // variable to hold start time
  const [startTime, setStartTime] = useState(Date.parse(lap.getStartTime()));

  const [time, setTime] = useState({
    hours: lap.getCurrentHours(),
    minutes: lap.getCurrentMinutes(),
    seconds: lap.getCurrentSeconds(),
  });

  useEffect(() => {
    // set starttime
    setStartTime(Date.parse(lap.getStartTime()));
  }, []);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      // find paused time
      const elapsedTimeMilliseconds =
        (lap.getCurrentHours() * 3600 + lap.getCurrentMinutes() * 60 + lap.getCurrentSeconds()) *
        1000;
      let pausedTime = Date.now() - (startTime + elapsedTimeMilliseconds);
      interval = setInterval(() => {
        setTime(() => {
          let curLapTimeMillisecond = Date.now() - startTime - pausedTime;
          let seconds = Math.floor((curLapTimeMillisecond / 1000) % 60).toString();
          let minutes = Math.floor((curLapTimeMillisecond / (1000 * 60)) % 60).toString();
          let hours = Math.floor(curLapTimeMillisecond / (1000 * 60 * 60));
          seconds = parseInt(seconds, 10);
          minutes = parseInt(minutes, 10);
          hours = parseInt(hours, 10);

          UpdateCurrentWorkLapTime(lap.getId(), hours, minutes, seconds);

          return {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          };
        });
      }, 1000);
    } else {
      clearInterval(interval);

      UpdateCurrentWorkLapTime(lap.getId(), time.hours, time.minutes, time.seconds);
    }

    if (clearTimer) {
      setTime({ hours: 0, minutes: 0, seconds: 0 });
      UpdateCurrentWorkLapTime(lap.getId(), time.hours, time.minutes, time.seconds);
      // set starttime
      setStartTime(Date.parse(lap.getStartTime()));
      setClearTimer(false);
    }

    return () => clearInterval(interval);
  }, [isPlaying, clearTimer, setClearTimer]);

  return (
    <div className={`${textClass} font-bold tabular-nums`}>
      {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}:
      {time.seconds.toString().padStart(2, '0')}
    </div>
  );
};

Timer.propTypes = {
  lap: PropTypes.object.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  clearTimer: PropTypes.bool.isRequired,
  setClearTimer: PropTypes.func.isRequired,
  UpdateCurrentWorkLapTime: PropTypes.func.isRequired,
  textClass: PropTypes.string,
};

export default Timer;
