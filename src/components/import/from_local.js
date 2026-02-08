import WorkLap from '../../classes/WorkLapClass.js';

function getFromLocalStorage() {
  // Get the JSON string from localStorage
  let lapsJSON = localStorage.getItem('laps');

  // Check if localStorage is empty
  if (!lapsJSON) {
    console.log('No laps found in local storage');
    return [];
  }

  // Convert the JSON string back to an array
  let lapsPlain = JSON.parse(lapsJSON);

  // Convert the plain objects to WorkLap instances
  let laps = lapsPlain.map(
    (lap) => {
      const workLap = new WorkLap(
        lap.startTime,
        lap.endTime,
        lap.current_hours,
        lap.current_minutes,
        lap.current_seconds,
        lap.workDoneString,
        lap.HourlyAmount,
        lap.id
      );
      // Restore break lap status (was not being persisted before)
      if (lap.isBreakLap) {
        workLap.setIsBreakLap(true);
      }
      return workLap;
    }
  );

  // console.log("Laps from local storage: ", laps);

  return laps;
}

export default getFromLocalStorage;
