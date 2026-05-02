import { useContext } from 'react';
import { LapContext } from '../context/LapContext';
import Timer from '../components/Timer';
import TimerContinuous from '../components/TimerContinuous';
import PropTypes from 'prop-types';

export default function TimerDisplay({
  lap,
  enlarged = false,
}) {
  const { laps, getLapFromId, getFirstLap } = useContext(LapContext);

  // In enlarged/minimalist mode, show a bigger timer
  const timerTextClass = enlarged ? 'text-[10vw] md:text-[8vw] lg:text-[7rem]' : 'text-9xl';
  const containerPadding = enlarged ? 'p-10' : 'p-8';

  return (
    <div>
      {laps.length > 0 ? (
        <div className={`flex justify-center items-center ${enlarged ? 'min-h-[14rem]' : 'h-48'}  gap-16 m-10`}>
          <div className={`outline ${containerPadding} rounded-xl pb-2 outline-base-300`}>
            <Timer
              lap={getLapFromId(lap) ? getLapFromId(lap) : getFirstLap()}
              textClass={timerTextClass}
            />
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Lap Time
            </div>
          </div>
          <div className={`outline ${containerPadding} rounded-xl pb-2 outline-base-300`}>
            <TimerContinuous
              textClass={timerTextClass}
            />
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Total Time
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center items-center h-48  gap-16 m-10">
          <div className="outline p-8 rounded-xl pb-2 outline-base-300">
            <div className="text-9xl font-bold">00:00:00</div>
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Lap Time
            </div>
          </div>
          <div className="outline p-8 rounded-xl pb-2 outline-base-300">
            <div className="text-9xl font-bold text-accent">00:00:00</div>
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Total Time
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// props validation
TimerDisplay.propTypes = {
  lap: PropTypes.string.isRequired,
  enlarged: PropTypes.bool,
};
