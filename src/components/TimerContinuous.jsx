import PropTypes from 'prop-types';
import { useContext } from 'react';
import { LapContext } from '../context/LapContext';
import { partsFromSeconds } from '../utils/timerMath';

const TimerContinuous = ({ textClass = 'text-9xl' }) => {
  const { getTotalTimeSpentSeconds } = useContext(LapContext);
  const time = partsFromSeconds(getTotalTimeSpentSeconds());

  return (
    <div className={`${textClass} font-bold text-accent`}>
      {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}:
      {time.seconds.toString().padStart(2, '0')}
    </div>
  );
};

TimerContinuous.propTypes = {
  textClass: PropTypes.string,
};

export default TimerContinuous;
