import PropTypes from 'prop-types';
import { partsFromSeconds, secondsFromParts } from '../utils/timerMath';

const Timer = ({ lap, textClass = 'text-9xl' }) => {
  const time = partsFromSeconds(
    secondsFromParts(lap.getCurrentHours(), lap.getCurrentMinutes(), lap.getCurrentSeconds())
  );

  return (
    <div className={`${textClass} font-bold`}>
      {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}:
      {time.seconds.toString().padStart(2, '0')}
    </div>
  );
};

Timer.propTypes = {
  lap: PropTypes.object.isRequired,
  textClass: PropTypes.string,
};

export default Timer;
