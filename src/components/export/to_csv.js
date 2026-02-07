import { saveAs } from 'file-saver';
import { generateCSV } from '../../utils/csvUtils';

function downloadCSV(laps) {
  // Use the shared CSV utility which handles:
  // - Chronological order (oldest first)
  // - Proper RFC 4180 escaping (newlines, commas, quotes in fields)
  const csvContent = generateCSV(laps);

  // Create a Blob from the CSV content
  let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // Trigger the download
  saveAs(blob, 'laps.csv');
}

export default downloadCSV;
