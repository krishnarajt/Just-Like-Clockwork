// Export utilities for saved sessions
// These work with plain session objects (not WorkLap instances)

import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { escapeCSVField } from '../../utils/csvUtils';

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
export function exportSessionPDF(session) {
  const doc = new jsPDF();

  // Title
  const dateStr = new Date(session.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(`Session - ${dateStr}`, 14, 20);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(11);
  doc.text(`Laps: ${session.lapCount}   |   Duration: ${formatDuration(session.totalSeconds)}   |   Earned: ₹${session.totalAmount.toFixed(2)}`, 14, 28);

  // Table columns
  const columns = [
    '#',
    'Start Time',
    'End Time',
    'Hours',
    'Minutes',
    'Seconds',
    'Work Done',
    'Break',
    'Hourly Amount',
  ];

  // Reverse to chronological order
  const chronologicalLaps = [...session.laps].reverse();

  const rows = chronologicalLaps.map((lap, index) => [
    (index + 1).toString(),
    typeof lap.startTime === 'string' ? lap.startTime : '—',
    lap.endTime === 0 ? 'DNF' : (typeof lap.endTime === 'string' ? lap.endTime : '—'),
    lap.current_hours || 0,
    lap.current_minutes || 0,
    lap.current_seconds || 0,
    lap.workDoneString || '',
    lap.isBreakLap ? 'Yes' : 'No',
    lap.HourlyAmount || 0,
  ]);

  autoTable(doc, {
    startY: 34,
    head: [columns],
    body: rows,
    foot: [[
      session.lapCount,
      'Total',
      '',
      '',
      Math.round(session.totalSeconds / 60),
      '',
      '',
      '',
      session.totalAmount.toFixed(2),
    ]],
    footStyles: { fillColor: [41, 128, 185], textColor: 255 },
    styles: { fontSize: 8 },
    headStyles: { fontSize: 9 },
  });

  const fileDateStr = new Date(session.createdAt).toISOString().split('T')[0];
  doc.save(`session_${fileDateStr}.pdf`);
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
export function exportAllSessionsPDF(sessions) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('All Sessions Report', 14, 20);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(11);
  doc.text(`Total sessions: ${sessions.length}`, 14, 28);

  let startY = 36;

  sessions.forEach((session, sIdx) => {
    const dateStr = new Date(session.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });

    // Check if we need a new page for the session header
    if (startY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Session ${sIdx + 1} — ${dateStr}`, 14, startY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`${session.lapCount} laps  |  ${formatDuration(session.totalSeconds)}  |  ₹${session.totalAmount.toFixed(2)}`, 14, startY + 6);

    const columns = ['#', 'Start', 'End', 'H', 'M', 'S', 'Work Done', 'Break', '₹/hr'];
    const chronologicalLaps = [...session.laps].reverse();
    const rows = chronologicalLaps.map((lap, i) => [
      (i + 1).toString(),
      typeof lap.startTime === 'string' ? lap.startTime : '—',
      lap.endTime === 0 ? 'DNF' : (typeof lap.endTime === 'string' ? lap.endTime : '—'),
      lap.current_hours || 0,
      lap.current_minutes || 0,
      lap.current_seconds || 0,
      lap.workDoneString || '',
      lap.isBreakLap ? 'Yes' : 'No',
      lap.HourlyAmount || 0,
    ]);

    const tableResult = autoTable(doc, {
      startY: startY + 10,
      head: [columns],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    startY = (tableResult?.finalY ?? doc.lastAutoTable?.finalY ?? startY + 40) + 12;
  });

  doc.save('all_sessions.pdf');
}

// Helper
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}
