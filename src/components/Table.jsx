import RandomSVG from './ui/RandomSVG';
import { StartButton } from './ui/StartButton';
import { useContext } from 'react';
import PropTypes from 'prop-types';
import { LapContext } from '../context/LapContext';

export default function Table({ updateWorkDoneByID }) {
  const { laps, showAmount } = useContext(LapContext);

  return (
    <div>
      {laps.length > 0 ? (
        <div className="overflow-x-auto m-6 border border-base-300 rounded-2xl scroll-auto">
          <table className="table table-lg text-xl">
            {/* head */}
            <thead>
              <tr className="text-2xl">
                <th className="w-4">ID</th>
                <th className="w-12">Day</th>
                <th className="w-36">Start Time</th>
                <th className="w-36">End Time</th>
                <th className="w-36">Elapsed Time</th>
                <th className="w-1/3 break-words">Work Done</th>
                <th className="w-12">Break</th>
                {showAmount && (
                  <th className="w-12">Amount</th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* body */}
              {laps.map((lap, index) => {
                return (
                  <tr key={index + 1} className="text-2xl border-0">
                    <td className="w-fit text-2xl">{index + 1}</td>
                    <td className="text-2xl">
                      <span className="text-accent">
                        {lap.getStartDayAndDateDict().day}
                      </span>
                      <br />
                      <span className="text-base-content/50">
                        {lap.getStartDayAndDateDict().date}
                      </span>
                    </td>
                    <td className="text-2xl">
                      {lap.getStartTimeDateFormatted()}
                    </td>
                    <td className="text-2xl">
                      {lap.getEndTimeDateFormatted()}
                    </td>
                    <td className="text-2xl tabular-nums">
                      {lap.getCurrentHours()}h: {lap.getCurrentMinutes()}m:{' '}
                      {lap.getCurrentSeconds()}s
                    </td>
                    <td className="text-2xl break-words">
                      <textarea
                        className="textarea textarea-bordered w-full rounded-lg text-xl h-36"
                        placeholder="Type here"
                        value={lap.getWorkDoneString()}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        autoComplete="off"
                        onChange={(e) => {
                          updateWorkDoneByID(lap.getId(), e.target.value);
                        }}
                      ></textarea>
                    </td>
                    <td className="text-2xl">
                      <div className="flex justify-start items-center h-full w-full">
                        <input type="checkbox" className="checkbox checkbox-warning"
                          checked={lap.getIsBreakLap()}
                          onChange={(e) => {
                            lap.setIsBreakLap(e.target.checked);
                            updateWorkDoneByID(lap.getId(), lap.getWorkDoneString());
                          }}
                        />
                      </div>
                    </td>
                    {showAmount && (
                      <td className="text-2xl"> {'₹ ' + lap.getAmount().toFixed(2)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex justify-center items-center h-fit gap-16 m-10 border border-base-300 p-6 rounded-2xl min-h-64 text-2xl text-base-content/50 flex-col">
          <RandomSVG />
          <div className="flex gap-1 items-center justify-center text-center">
            <div>No Laps Added Yet! Start by clicking</div>
            <StartButton className="w-12 h-12 text-accent transition-all duration-200 hover:scale-90" />{' '}
            above.
          </div>
        </div>
      )}
    </div>
  );
}

// props validation
Table.propTypes = {
  updateWorkDoneByID: PropTypes.func.isRequired,
};
