// CSV utility functions
// Handles proper escaping of fields with newlines, commas, and quotes

/**
 * Properly escape a CSV field according to RFC 4180
 * Fields containing commas, newlines, carriage return, or double quotes must be enclosed in double quotes
 * Double quotes within fields must be escaped by doubling them
 * @param {*} field - The field value to escape
 * @returns {string} The properly escaped CSV field
 */
export function escapeCSVField(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If the field contains a comma, newline, carriage return, or double quote, wrap it in quotes
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate a CSV string from laps array (chronological order - oldest first)
 * @param {Array} laps - Array of WorkLap objects (stored newest-first internally)
 * @returns {string} Properly formatted CSV string
 */
export function generateCSV(laps) {
  const header = 'ID,Start Time,End Time,Hours,Minutes,Seconds,Work Done,Break,Hourly Amount';

  // Reverse to get chronological order (oldest first)
  const chronologicalLaps = [...laps].reverse();

  const rows = chronologicalLaps.map((lap, index) => {
    const startTime = typeof lap.startTime === 'string' ? lap.startTime : String(lap.startTime);
    let endTime = lap.endTime === 0 ? 'Not yet done' : (typeof lap.endTime === 'string' ? lap.endTime : String(lap.endTime));

    // Every field goes through escapeCSVField to handle newlines, commas, quotes
    return [
      escapeCSVField(index + 1),
      escapeCSVField(startTime),
      escapeCSVField(endTime),
      escapeCSVField(lap.current_hours),
      escapeCSVField(lap.current_minutes),
      escapeCSVField(lap.current_seconds),
      escapeCSVField(lap.workDoneString),
      escapeCSVField(lap.isBreakLap ? 'Yes' : 'No'),
      escapeCSVField(lap.HourlyAmount),
    ].join(',');
  });

  return header + '\n' + rows.join('\n');
}

/**
 * Copy CSV to clipboard
 * @param {Array} laps - Array of WorkLap objects
 * @returns {Promise<boolean>} Whether the copy succeeded
 */
export async function copyCSVToClipboard(laps) {
  const csvContent = generateCSV(laps);
  try {
    await navigator.clipboard.writeText(csvContent);
    return true;
  } catch (e) {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = csvContent;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (fallbackError) {
      console.error('Failed to copy CSV to clipboard:', fallbackError);
      return false;
    }
  }
}
