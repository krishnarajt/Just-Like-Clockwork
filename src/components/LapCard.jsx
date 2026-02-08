import { useContext, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { LapContext } from '../context/LapContext';
import ImageAttachment from './ImageAttachment';
import { addImage } from '../utils/imageStore';
import RandomSVG from './ui/RandomSVG';
import { StartButton as StartButtonSVG } from './ui/StartButton';
import { showToast } from '../utils/toast';

/**
 * Single lap displayed as a rounded card with split/merge controls
 */
function LapCard({ lap, index, totalLaps, updateWorkDoneByID, isFirst, isLast }) {
  const { splitLap, mergeLaps, laps, showAmount } = useContext(LapContext);
  const textareaRef = useRef(null);

  // The display index (chronological: oldest = 1)
  // Since laps are stored newest-first, display index = totalLaps - index
  const displayIndex = totalLaps - index;

  // Handle paste event on textarea to capture images from clipboard
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = (ev) => {
          // Resize image before storing
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 800;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = (h / w) * maxDim; w = maxDim; }
              else { w = (w / h) * maxDim; h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.7);
            addImage(lap.getId(), compressed);
            // Force re-render by triggering a minor state change
            updateWorkDoneByID(lap.getId(), lap.getWorkDoneString());
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        break; // Only handle first image
      }
    }
  }, [lap, updateWorkDoneByID]);

  // Get adjacent lap for merge operations
  // index-1 is the NEWER lap (above in newest-first), index+1 is the OLDER lap (below)
  const newerLap = index > 0 ? laps[index - 1] : null;
  const olderLap = index < laps.length - 1 ? laps[index + 1] : null;

  const totalSeconds = lap.getTotalTimeInSecondsRaw();
  const isActiveLap = lap.endTime === 0; // Currently running lap
  const canSplit = totalSeconds >= 2 && !isActiveLap; // Need at least 2 seconds and not active

  return (
    <div className="w-full">
      {/* Merge with newer (above) button - shown between cards */}
      {!isFirst && newerLap && (
        <div className="flex justify-center -my-1 relative z-10">
          <button
            className="btn btn-xs btn-ghost text-base-content/30 hover:text-primary hover:bg-primary/10 gap-1 rounded-full px-3 transition-all"
            onClick={() => mergeLaps(lap.getId(), newerLap.getId())}
            title="Merge with lap above"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
            merge
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      )}

      {/* The lap card */}
      <div className={`rounded-2xl border p-5 md:p-6 transition-all ${
        lap.getIsBreakLap()
          ? 'border-warning/30 bg-warning/5'
          : 'border-base-300 bg-base-200/30 hover:bg-base-200/60'
      }`}>
        {/* Header row: index, time info, break toggle */}
        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Left: index and day/date */}
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold text-primary min-w-[2rem] text-center">
              {displayIndex}
            </div>
            <div className="flex flex-col">
              <span className="text-accent font-medium text-sm">
                {lap.getStartDayAndDateDict().day}
              </span>
              <span className="text-base-content/50 text-xs">
                {lap.getStartDayAndDateDict().date}
              </span>
            </div>
          </div>

          {/* Center: time info */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-center">
              <span className="text-base-content/50 text-xs">Start</span>
              <span className="font-medium">{lap.getStartTimeDateFormatted()}</span>
            </div>
            <span className="text-base-content/30">→</span>
            <div className="flex flex-col items-center">
              <span className="text-base-content/50 text-xs">End</span>
              <span className="font-medium">{lap.getEndTimeDateFormatted()}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-base-content/50 text-xs">Duration</span>
              <span className="font-bold text-secondary tabular-nums">
                {lap.getCurrentHours()}h {lap.getCurrentMinutes()}m {lap.getCurrentSeconds()}s
              </span>
            </div>
          </div>

          {/* Right: break toggle + amount */}
          <div className="flex items-center gap-3">
            {showAmount && (
              <span className="text-sm font-medium text-accent">
                ₹{lap.getAmount().toFixed(2)}
              </span>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer" title="Mark as break">
              <span className="text-xs text-base-content/50">Break</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-warning"
                checked={lap.getIsBreakLap()}
                onChange={(e) => {
                  lap.setIsBreakLap(e.target.checked);
                  updateWorkDoneByID(lap.getId(), lap.getWorkDoneString());
                }}
              />
            </label>
          </div>
        </div>

        {/* Work done textarea + split button on the right side */}
        <div className="flex gap-2 items-stretch">
          <textarea
            ref={textareaRef}
            className="textarea textarea-bordered w-full rounded-xl text-base min-h-[5rem] resize-y"
            placeholder="What did you work on?"
            value={lap.getWorkDoneString()}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => {
              updateWorkDoneByID(lap.getId(), e.target.value);
            }}
            onPaste={handlePaste}
          />

          {/* Split button on the right side of textarea */}
          {canSplit && (
            <button
              className="flex items-center justify-center px-1.5 rounded-lg text-base-content/20 hover:text-warning hover:bg-warning/10 transition-all group"
              onClick={() => splitLap(lap.getId())}
              title="Split this lap into two equal halves"
            >
              <div className="flex flex-col items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="3" x2="12" y2="8"/>
                  <line x1="12" y1="16" x2="12" y2="21"/>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span className="text-[9px] font-medium writing-mode-vertical hidden group-hover:block">split</span>
              </div>
            </button>
          )}
          {/* Disabled split button for active/running lap */}
          {!canSplit && isActiveLap && totalSeconds >= 2 && (
            <button
              className="flex items-center justify-center px-1.5 rounded-lg text-base-content/10 cursor-not-allowed transition-all group"
              onClick={() => showToast('Cannot split the currently running lap. Finish or lap it first.', 'warning')}
              title="Cannot split: lap is still running"
            >
              <div className="flex flex-col items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="3" x2="12" y2="8"/>
                  <line x1="12" y1="16" x2="12" y2="21"/>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
            </button>
          )}
        </div>

        {/* Image attachments */}
        <ImageAttachment lapId={lap.getId()} />
      </div>
    </div>
  );
}

LapCard.propTypes = {
  lap: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  totalLaps: PropTypes.number.isRequired,
  updateWorkDoneByID: PropTypes.func.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
};

/**
 * List of all lap cards with minimalist mode support
 */
export default function LapCardList({ updateWorkDoneByID }) {
  const { laps, minimalistMode } = useContext(LapContext);

  if (laps.length === 0) {
    return (
      <div className="flex justify-center items-center h-fit gap-16 m-10 outline p-6 rounded-xl outline-base-300 min-h-64 text-2xl text-base-content/50 flex-col">
        <RandomSVGWrapper />
        <div className="flex gap-1 items-center justify-center text-center">
          <div>No Laps Added Yet! Start by clicking</div>
          <StartButtonIcon />
          above.
        </div>
      </div>
    );
  }

  // In minimalist mode, show only the current (newest) lap prominently
  // and previous laps in a collapsible section
  if (minimalistMode) {
    const currentLap = laps[0];
    const previousLaps = laps.slice(1);

    return (
      <div className="px-4 md:px-8 py-4 max-w-4xl mx-auto w-full">
        {/* Current lap - always shown */}
        <LapCard
          lap={currentLap}
          index={0}
          totalLaps={laps.length}
          updateWorkDoneByID={updateWorkDoneByID}
          isFirst={true}
          isLast={laps.length === 1}
        />

        {/* Previous laps - collapsible */}
        {previousLaps.length > 0 && (
          <div className="mt-6">
            <details className="group">
              <summary className="cursor-pointer text-base-content/50 hover:text-base-content transition-colors text-sm flex items-center gap-2 mb-3 select-none">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-open:rotate-90"
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                {previousLaps.length} previous lap{previousLaps.length !== 1 ? 's' : ''}
              </summary>
              <div className="flex flex-col gap-1">
                {previousLaps.map((lap, i) => (
                  <LapCard
                    key={lap.getId()}
                    lap={lap}
                    index={i + 1}
                    totalLaps={laps.length}
                    updateWorkDoneByID={updateWorkDoneByID}
                    isFirst={i === 0}
                    isLast={i === previousLaps.length - 1}
                  />
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }

  // Normal mode: show all lap cards vertically
  return (
    <div className="px-4 md:px-8 py-4 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-1">
        {laps.map((lap, index) => (
          <LapCard
            key={lap.getId()}
            lap={lap}
            index={index}
            totalLaps={laps.length}
            updateWorkDoneByID={updateWorkDoneByID}
            isFirst={index === 0}
            isLast={index === laps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

LapCardList.propTypes = {
  updateWorkDoneByID: PropTypes.func.isRequired,
};

// Small helper components
function RandomSVGWrapper() {
  return <RandomSVG />;
}

function StartButtonIcon() {
  return <StartButtonSVG className="w-12 h-12 text-accent transition-all duration-200 hover:scale-90" />;
}
