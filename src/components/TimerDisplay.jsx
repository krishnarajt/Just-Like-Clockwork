import { useContext } from 'react';
import { LapContext } from '../context/LapContext';
import Timer from '../components/Timer';
import TimerContinuous from '../components/TimerContinuous';
import PropTypes from 'prop-types';

export default function TimerDisplay({
  isPlaying,
  clearLapTimer,
  setClearLapTimer,
  clearTimer,
  setClearTimer,
  lap,
  enlarged = false,
}) {
  const UpdateCurrentWorkLapTime = (lapId, hours, minutes, seconds) => {
    updateLap(lapId, hours, minutes, seconds);
  };

  const { laps, getLapFromId, getFirstLap, updateLap } = useContext(LapContext);

  // In enlarged/minimalist mode, show a bigger timer
  const timerTextClass = enlarged ? 'text-[10vw] md:text-[8vw] lg:text-[7rem]' : 'text-9xl';
  const containerPadding = enlarged ? 'p-10' : 'p-8';

  return (
    <div>
      {laps.length > 0 ? (
        <div className={`flex justify-center items-center ${enlarged ? 'min-h-[14rem]' : 'h-48'} gap-8 md:gap-16 m-6 md:m-10 flex-wrap`}>
          <div className={`border border-base-300 ${containerPadding} rounded-2xl pb-2 bg-base-200/20`}>
            <Timer
              lap={getLapFromId(lap) ? getLapFromId(lap) : getFirstLap()}
              isPlaying={isPlaying}
              clearTimer={clearLapTimer}
              setClearTimer={setClearLapTimer}
              UpdateCurrentWorkLapTime={UpdateCurrentWorkLapTime}
              textClass={timerTextClass}
            />
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Lap Time
            </div>
          </div>
          <div className={`border border-base-300 ${containerPadding} rounded-2xl pb-2 bg-base-200/20`}>
            <TimerContinuous
              isPlaying={isPlaying}
              clearTimer={clearTimer}
              setClearTimer={setClearTimer}
              textClass={timerTextClass}
            />
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Total Time
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center items-center h-48 gap-8 md:gap-16 m-6 md:m-10 flex-wrap">
          <div className="border border-base-300 p-8 rounded-2xl pb-2 bg-base-200/20">
            <div className="text-9xl font-bold tabular-nums">00:00:00</div>
            <div className="flex justify-center items-center text-center text-2xl italic text-secondary">
              Lap Time
            </div>
          </div>
          <div className="border border-base-300 p-8 rounded-2xl pb-2 bg-base-200/20">
            <div className="text-9xl font-bold text-accent tabular-nums">00:00:00</div>
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
  isPlaying: PropTypes.bool.isRequired,
  clearLapTimer: PropTypes.bool.isRequired,
  setClearLapTimer: PropTypes.func.isRequired,
  clearTimer: PropTypes.bool.isRequired,
  setClearTimer: PropTypes.func.isRequired,
  lap: PropTypes.string.isRequired,
  enlarged: PropTypes.bool,
};
