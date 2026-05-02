// Export utilities for saved sessions
// These work with plain session objects (not WorkLap instances)

import { saveAs } from 'file-saver';
import { escapeCSVField } from '../../utils/csvUtils';
import { saveReceiptPdf } from './pdfReceipt';
import { formatLocalDateTime } from '../../utils/timeFormat';

/**
 * Generate CSV string from a session's laps (plain objects)
 * @param {Array} laps - Array of plain lap objects (stored newest-first)
 * @returns {string} CSV string
 */
function generateSessionCSV(laps) {
  const header = 'ID,Start Time,End Time,Hours,Minutes,Seconds,Work Done,Break,Hourly Amount';

  // Reverse to get chronological order (oldest first)
  const chronologicalLaps = [...laps].reverse();

  const rows = chronologicalLaps.map((lap, index) => {
    const startTime = typeof lap.startTime === 'string' ? lap.startTime : String(lap.startTime);
    let endTime = lap.endTime === 0 ? 'Not yet done' : (typeof lap.endTime === 'string' ? lap.endTime : String(lap.endTime));

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
 * Export a single session as CSV
 * @param {object} session - Session object from sessionStore
 */
export function exportSessionCSV(session) {
  const csvContent = generateSessionCSV(session.laps);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dateStr = new Date(session.createdAt).toISOString().split('T')[0];
  saveAs(blob, `session_${dateStr}.csv`);
}

/**
 * Export a single session as JSON
 * @param {object} session - Session object from sessionStore
 */
export function exportSessionJSON(session) {
  const jsonString = JSON.stringify(session, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date(session.createdAt).toISOString().split('T')[0];
  saveAs(blob, `session_${dateStr}.json`);
}

/**
 * Export a single session as PDF
 * @param {object} session - Session object from sessionStore
 */
export async function exportSessionPDF(session) {
  const createdAt = session.createdAt || session.created_at || new Date().toISOString();
  const fileDateStr = new Date(createdAt).toISOString().split('T')[0];

  await saveReceiptPdf({
    session,
    laps: session.laps || [],
    title: session.sessionName || 'Session Receipt',
    subtitle: session.description || '',
    totals: {
      totalAmount: session.totalAmount ?? session.total_amount,
      totalSeconds: session.totalSeconds ?? session.total_seconds ?? session.totalDuration ?? session.total_duration,
      totalLaps: session.lapCount ?? session.lap_count,
    },
    filename: `session_${fileDateStr}.pdf`,
  });
}

/**
 * Export ALL sessions as a single CSV
 * @param {Array} sessions - Array of session objects
 */
export function exportAllSessionsCSV(sessions) {
  const header = 'Session,Session Date,Lap #,Start Time,End Time,Hours,Minutes,Seconds,Work Done,Break,Hourly Amount';

  const rows = [];
  sessions.forEach((session, sIdx) => {
    const sessionDate = new Date(session.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const chronologicalLaps = [...session.laps].reverse();
    chronologicalLaps.forEach((lap, lIdx) => {
      const startTime = typeof lap.startTime === 'string' ? lap.startTime : String(lap.startTime);
      let endTime = lap.endTime === 0 ? 'Not yet done' : (typeof lap.endTime === 'string' ? lap.endTime : String(lap.endTime));

      rows.push([
        escapeCSVField(sIdx + 1),
        escapeCSVField(sessionDate),
        escapeCSVField(lIdx + 1),
        escapeCSVField(startTime),
        escapeCSVField(endTime),
        escapeCSVField(lap.current_hours),
        escapeCSVField(lap.current_minutes),
        escapeCSVField(lap.current_seconds),
        escapeCSVField(lap.workDoneString),
        escapeCSVField(lap.isBreakLap ? 'Yes' : 'No'),
        escapeCSVField(lap.HourlyAmount),
      ].join(','));
    });
  });

  const csvContent = header + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, 'all_sessions.csv');
}

/**
 * Export ALL sessions as JSON
 * @param {Array} sessions - Array of session objects
 */
export function exportAllSessionsJSON(sessions) {
  const jsonString = JSON.stringify(sessions, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  saveAs(blob, 'all_sessions.json');
}

/**
 * Export ALL sessions as a single PDF
 * @param {Array} sessions - Array of session objects
 */
export async function exportAllSessionsPDF(sessions) {
  const allLaps = [];
  let totalSeconds = 0;
  let totalAmount = 0;
  let totalLaps = 0;

  sessions.forEach((session, sIdx) => {
    const sessionLabel = session.sessionName || `Session ${sIdx + 1}`;
    const sessionDate = formatLocalDateTime(session.createdAt || session.startTime);
    const laps = Array.isArray(session.laps) ? session.laps : [];

    totalSeconds += Number(session.totalSeconds ?? session.total_seconds ?? session.totalDuration ?? session.total_duration ?? 0);
    totalAmount += Number(session.totalAmount ?? session.total_amount ?? 0);
    totalLaps += Number(session.lapCount ?? session.lap_count ?? laps.length);

    laps.forEach((lap) => {
      const workDone = lap.workDoneString || lap.work_done_string || lap.lapName || lap.lap_name || '';
      allLaps.push({
        ...lap,
        lapName: undefined,
        lap_name: undefined,
        workDoneString: `${sessionLabel} (${sessionDate})${workDone ? `: ${workDone}` : ''}`,
      });
    });
  });

  await saveReceiptPdf({
    session: {
      sessionName: 'All Sessions Receipt',
      description: `${sessions.length} sessions exported together`,
      createdAt: new Date().toISOString(),
    },
    laps: allLaps,
    totals: {
      totalAmount,
      totalSeconds,
      totalLaps,
    },
    filename: 'all_sessions_receipt.pdf',
  });
}
