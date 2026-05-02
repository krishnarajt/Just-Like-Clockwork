import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { mergeLapImageSources } from '../../utils/imageStore';
import { formatDuration, formatLocalDate, formatLocalDateTime, formatLocalTime, parseTimestamp } from '../../utils/timeFormat';

const PAGE_MARGIN = 14;
const BRAND_COLOR = [32, 92, 130];
const ACCENT_COLOR = [35, 152, 124];
const SOFT_FILL = [241, 247, 249];
const LINE_COLOR = [213, 226, 232];

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getLapId(lap) {
  return lap.lapUuid || lap.lap_uuid || lap.id;
}

function getLapStart(lap) {
  return lap.startedAt || lap.started_at || lap.startTime || null;
}

function getLapEnd(lap) {
  return lap.endedAt || lap.ended_at || lap.endTime || null;
}

function getLapDurationSeconds(lap) {
  const duration = lap.duration ?? lap.totalSeconds ?? lap.total_seconds;
  if (duration !== undefined && duration !== null) return numberOrZero(duration);

  const hours = lap.currentHours ?? lap.current_hours ?? lap.hours;
  const minutes = lap.currentMinutes ?? lap.current_minutes ?? lap.minutes;
  const seconds = lap.currentSeconds ?? lap.current_seconds ?? lap.seconds;

  return numberOrZero(hours) * 3600 + numberOrZero(minutes) * 60 + numberOrZero(seconds);
}

function getLapHourlyAmount(lap) {
  return numberOrZero(lap.hourlyAmount ?? lap.hourly_amount ?? lap.HourlyAmount);
}

function getLapWorkName(lap) {
  return lap.lapName || lap.lap_name || lap.workDoneString || lap.work_done_string || '';
}

function normalizeLap(lap) {
  const durationSeconds = getLapDurationSeconds(lap);
  const hourlyAmount = getLapHourlyAmount(lap);

  return {
    id: getLapId(lap),
    startTime: getLapStart(lap),
    endTime: getLapEnd(lap),
    durationSeconds,
    workDoneString: getLapWorkName(lap),
    isBreakLap: Boolean(lap.isBreakLap ?? lap.is_break_lap),
    hourlyAmount,
    amount: hourlyAmount * (durationSeconds / 3600),
    images: lap.images || [],
  };
}

function sortLapsChronologically(laps = []) {
  return laps
    .map(normalizeLap)
    .sort((a, b) => {
      const aTime = parseTimestamp(a.startTime)?.getTime() ?? 0;
      const bTime = parseTimestamp(b.startTime)?.getTime() ?? 0;
      return aTime - bTime;
    });
}

function formatMoney(value) {
  return `INR ${numberOrZero(value).toFixed(2)}`;
}

function receiptFilename(prefix, createdAt) {
  const date = parseTimestamp(createdAt) || new Date();
  return `${prefix}_${date.toISOString().slice(0, 10)}.pdf`;
}

function drawHeader(doc, { title, subtitle, createdAt, receiptId }) {
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  doc.text('Just Like Clockwork', PAGE_MARGIN, 17);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Work session receipt', PAGE_MARGIN, 25);

  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text(title || 'Session Receipt', PAGE_MARGIN, 36, {
    maxWidth: doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2,
  });

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated ${formatLocalDateTime(new Date())}`, doc.internal.pageSize.getWidth() - PAGE_MARGIN, 15, {
    align: 'right',
  });
  doc.text(`Receipt ${receiptId || '-'}`, doc.internal.pageSize.getWidth() - PAGE_MARGIN, 22, {
    align: 'right',
  });

  doc.setTextColor(35, 48, 60);
  doc.setFontSize(10);
  if (subtitle) doc.text(subtitle, PAGE_MARGIN, 50, { maxWidth: doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2 });
  doc.setTextColor(99, 110, 120);
  doc.text(`Session date: ${formatLocalDateTime(createdAt || new Date())}`, PAGE_MARGIN, subtitle ? 57 : 50);
}

function drawSummaryCards(doc, summary, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cardWidth = (pageWidth - PAGE_MARGIN * 2 - gap * 3) / 4;
  const cards = [
    ['Laps', String(summary.lapCount)],
    ['Duration', formatDuration(summary.totalSeconds)],
    ['Earned', formatMoney(summary.totalAmount)],
    ['Breaks', String(summary.breakCount)],
  ];

  cards.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    doc.setFillColor(...SOFT_FILL);
    doc.setDrawColor(...LINE_COLOR);
    doc.roundedRect(x, startY, cardWidth, 21, 2, 2, 'FD');
    doc.setTextColor(99, 110, 120);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text(label.toUpperCase(), x + 4, startY + 7);
    doc.setTextColor(...(index === 2 ? ACCENT_COLOR : BRAND_COLOR));
    doc.setFontSize(11);
    doc.text(value, x + 4, startY + 15, { maxWidth: cardWidth - 8 });
  });
}

function getSummary(laps, session = {}, overrides = {}) {
  const totalSeconds = numberOrZero(overrides.totalSeconds ?? session.totalSeconds ?? session.total_seconds)
    || laps.reduce((sum, lap) => sum + lap.durationSeconds, 0);
  const totalAmount = numberOrZero(overrides.totalAmount ?? session.totalAmount ?? session.total_amount)
    || laps.reduce((sum, lap) => sum + lap.amount, 0);

  return {
    lapCount: numberOrZero(overrides.totalLaps ?? session.lapCount ?? session.lap_count) || laps.length,
    totalSeconds,
    totalAmount,
    breakCount: laps.filter((lap) => lap.isBreakLap).length,
  };
}

function getReceiptId(session) {
  const id = session?.sessionUuid || session?.session_uuid || session?.id;
  if (!id) return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
  return String(id).slice(0, 18);
}

async function imageSourceToDataUrl(source) {
  if (!source) return null;
  if (source.startsWith('data:')) return source;

  const response = await fetch(source);
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);

  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function addPageIfNeeded(doc, y, neededHeight = 24) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededHeight <= pageHeight - PAGE_MARGIN) return y;
  doc.addPage();
  return PAGE_MARGIN;
}

async function addAttachments(doc, laps, startY) {
  const lapsWithImages = laps
    .map((lap, index) => ({
      lap,
      index,
      images: lap.id ? mergeLapImageSources(lap.id, lap.images) : [],
    }))
    .filter((item) => item.images.length > 0);

  if (lapsWithImages.length === 0) return startY;

  let y = addPageIfNeeded(doc, startY + 10, 32);
  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text('Attachments', PAGE_MARGIN, y);
  y += 9;

  for (const { lap, index, images } of lapsWithImages) {
    y = addPageIfNeeded(doc, y, 28);
    const lapTitle = lap.workDoneString?.trim() || 'Untitled lap';

    doc.setTextColor(35, 48, 60);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`Lap ${index + 1}: ${lapTitle}`, PAGE_MARGIN, y, {
      maxWidth: doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2,
    });
    y += 6;

    doc.setTextColor(99, 110, 120);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(`${formatLocalDateTime(lap.startTime)} to ${lap.endTime === 0 ? 'DNF' : formatLocalDateTime(lap.endTime)}`, PAGE_MARGIN, y);
    y += 7;

    for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      y = addPageIfNeeded(doc, y, 32);
      doc.setTextColor(...ACCENT_COLOR);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`Image ${imageIndex + 1}`, PAGE_MARGIN, y);
      y += 5;

      try {
        const dataUrl = await imageSourceToDataUrl(images[imageIndex]);
        const properties = doc.getImageProperties(dataUrl);
        const maxWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
        const maxHeight = doc.internal.pageSize.getHeight() - y - PAGE_MARGIN;
        let imageWidth = maxWidth;
        let imageHeight = imageWidth * (properties.height / properties.width);

        if (imageHeight > maxHeight) {
          imageHeight = maxHeight;
          imageWidth = imageHeight * (properties.width / properties.height);
        }

        y = addPageIfNeeded(doc, y, imageHeight);
        const format = properties.fileType === 'PNG' ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, format, PAGE_MARGIN, y, imageWidth, imageHeight, undefined, 'NONE');
        y += imageHeight + 10;
      } catch (error) {
        console.warn('Failed to add image to PDF:', error);
        doc.setTextColor(160, 80, 80);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text('[Image could not be embedded]', PAGE_MARGIN, y);
        y += 10;
      }
    }
  }

  return y;
}

function addPageNumbers(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...LINE_COLOR);
    doc.line(PAGE_MARGIN, doc.internal.pageSize.getHeight() - 10, doc.internal.pageSize.getWidth() - PAGE_MARGIN, doc.internal.pageSize.getHeight() - 10);
    doc.setTextColor(120, 130, 138);
    doc.setFontSize(8);
    doc.text(`Page ${pageNumber} of ${pageCount}`, doc.internal.pageSize.getWidth() - PAGE_MARGIN, doc.internal.pageSize.getHeight() - 5, {
      align: 'right',
    });
  }
}

export async function saveReceiptPdf({ laps = [], session = {}, filename, title, subtitle, totals = {} }) {
  const doc = new jsPDF();
  const normalizedLaps = sortLapsChronologically(laps);
  const summary = getSummary(normalizedLaps, session, totals);
  const createdAt = session.createdAt || session.created_at || session.startTime || session.startedAt || normalizedLaps[0]?.startTime || new Date();
  const receiptTitle = title || session.sessionName || session.session_name || 'Session Receipt';

  drawHeader(doc, {
    title: receiptTitle,
    subtitle: subtitle || session.description || '',
    createdAt,
    receiptId: getReceiptId(session),
  });
  drawSummaryCards(doc, summary, 65);

  const rows = normalizedLaps.map((lap, index) => [
    String(index + 1),
    formatLocalDate(lap.startTime),
    formatLocalTime(lap.startTime, { fallback: '—' }),
    lap.endTime === 0 ? 'DNF' : formatLocalTime(lap.endTime, { fallback: 'DNF' }),
    formatDuration(lap.durationSeconds),
    lap.workDoneString || '—',
    lap.isBreakLap ? 'Yes' : 'No',
    lap.hourlyAmount ? formatMoney(lap.hourlyAmount) : '—',
    formatMoney(lap.amount),
  ]);

  autoTable(doc, {
    startY: 94,
    head: [['#', 'Date', 'Start', 'End', 'Duration', 'Lap / Work', 'Break', 'Rate', 'Amount']],
    body: rows,
    foot: [[
      '',
      'Total',
      '',
      '',
      formatDuration(summary.totalSeconds),
      `${summary.lapCount} lap${summary.lapCount === 1 ? '' : 's'}`,
      `${summary.breakCount} break${summary.breakCount === 1 ? '' : 's'}`,
      '',
      formatMoney(summary.totalAmount),
    ]],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [35, 48, 60],
      lineColor: LINE_COLOR,
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: BRAND_COLOR,
      textColor: 255,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [229, 241, 245],
      textColor: BRAND_COLOR,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 252, 253],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 22 },
      2: { cellWidth: 19 },
      3: { cellWidth: 19 },
      4: { cellWidth: 22 },
      5: { cellWidth: 46 },
      6: { halign: 'center', cellWidth: 14 },
      7: { halign: 'right', cellWidth: 22 },
      8: { halign: 'right', cellWidth: 22 },
    },
  });

  const tableEndY = doc.lastAutoTable?.finalY ?? 120;
  await addAttachments(doc, normalizedLaps, tableEndY);
  addPageNumbers(doc);

  doc.save(filename || receiptFilename('clockwork_receipt', createdAt));
}
