import { v4 as uuidv4 } from 'uuid';

class WorkLap {
  constructor(
    startTime,
    endTime,
    current_hours,
    current_minutes,
    current_seconds,
    workDoneString,
    HourlyAmount,
    id = uuidv4()
  ) {
    this.id = id;
    this.startTime = startTime;
    this.endTime = endTime;
    this.current_hours = Number(current_hours);
    this.current_minutes = Number(current_minutes);
    this.current_seconds = Number(current_seconds);
    this.workDoneString = workDoneString;
    this.isBreakLap = false;
    // type check hourly amount, if it is not a float, convert it to a float.
    if (typeof HourlyAmount !== 'number') {
      HourlyAmount = parseFloat(HourlyAmount);
    }
    this.HourlyAmount = HourlyAmount;
  }

  // Getters
  getId() {
    return this.id;
  }

  getHourlyAmount() {
    return this.HourlyAmount;
  }

  getStartTime() {
    return this.startTime;
  }

  getEndTime() {
    return this.endTime;
  }

  getCurrentHours() {
    return this.current_hours;
  }

  getCurrentMinutes() {
    return this.current_minutes;
  }

  getCurrentSeconds() {
    return this.current_seconds;
  }

  getWorkDoneString() {
    return this.workDoneString;
  }

  getIsBreakLap() {
    return this.isBreakLap;
  }

  getAmount() {
    const totalSeconds =
      this.current_hours * 3600 + this.current_minutes * 60 + this.current_seconds;
    const amount = this.HourlyAmount * (totalSeconds / 3600);
    return Number(amount.toFixed(3));
  }

  // get total time in Minutes
  getTotalTimeInMinutes() {
    const totalMinutes = this.current_hours * 60 + this.current_minutes + this.current_seconds / 60;
    return totalMinutes.toFixed(2);
  }

  // get total time in Seconds (string, for backward compat)
  getTotalTimeInSeconds() {
    const totalSeconds =
      this.current_hours * 3600 + this.current_minutes * 60 + this.current_seconds;
    return totalSeconds.toFixed(2);
  }

  // get total time in Seconds as raw integer (for split calculations etc.)
  getTotalTimeInSecondsRaw() {
    return this.current_hours * 3600 + this.current_minutes * 60 + this.current_seconds;
  }

  getStartTimeDate() {
    return new Date(this.startTime);
  }

  getEndTimeDate() {
    return new Date(this.endTime);
  }

  getStartTimeDateFormatted() {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
      .format(this.getStartTimeDate())
      .toUpperCase();

    return time;
  }

  getEndTimeDateFormatted() {
    if (this.endTime === 0) {
      return 'DNF';
    }

    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
      .format(this.getEndTimeDate())
      .toUpperCase();

    return time;
  }

  getStartDayAndDateDict() {
    const date = this.getStartTimeDate();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const formattedDate = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(this.getStartTimeDate());

    return {
      day: days[date.getDay()],
      date: formattedDate,
    };
  }

  // Setters
  setStartTime(startTime) {
    this.startTime = startTime;
  }

  setEndTime(endTime) {
    this.endTime = endTime;
  }

  setCurrentHours(current_hours) {
    this.current_hours = Number(current_hours);
  }

  setCurrentMinutes(current_minutes) {
    this.current_minutes = Number(current_minutes);
  }

  setCurrentSeconds(current_seconds) {
    this.current_seconds = Number(current_seconds);
  }

  setWorkDoneString(workDoneString) {
    this.workDoneString = workDoneString;
  }

  setHourlyAmount(amount) {
    this.HourlyAmount = Number(amount);
  }

  setIsBreakLap(isBreakLap) {
    this.isBreakLap = isBreakLap;
  }
}

export default WorkLap;
