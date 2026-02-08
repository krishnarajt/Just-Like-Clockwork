import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getImages } from '../../utils/imageStore';

function downloadPDF(laps, total_amount, total_minutes, total_laps) {
  // Create a new jsPDF instance
  const doc = new jsPDF();

  // Define the PDF table columns
  const columns = [
    'ID',
    'Start Time',
    'End Time',
    'Hours',
    'Minutes',
    'Seconds',
    'Work Done',
    'Break',
    'Hourly Amount',
  ];

  // Reverse to get chronological order (oldest first)
  const chronologicalLaps = [...laps].reverse();

  // Convert each lap to a PDF table row
  const rows = chronologicalLaps.map((lap, index) => [
    (index + 1).toString(),
    lap.startTime,
    lap.endTime === 0 ? 'Not Yet Finished' : lap.endTime,
    lap.current_hours,
    lap.current_minutes,
    lap.current_seconds,
    lap.workDoneString,
    lap.isBreakLap ? 'Yes' : 'No',
    lap.HourlyAmount,
  ]);

  // Add the table to the PDF
  autoTable(doc, {
    head: [columns],
    body: rows,
    foot: [[total_laps, 'Total', '', '', total_minutes, '', '', '', total_amount]],
    footStyles: { fillColor: [41, 128, 185], textColor: 255 },
  });

  // Add images section after the table
  let hasAnyImages = false;
  let imgY = 0;

  chronologicalLaps.forEach((lap, index) => {
    const images = getImages(lap.id);
    if (images.length === 0) return;

    if (!hasAnyImages) {
      // Add a page break and header for images section
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('Lap Attachments', 14, 20);
      doc.setFont(undefined, 'normal');
      imgY = 35;
      hasAnyImages = true;
    }

    // Check if we need a new page for the lap header
    if (imgY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      imgY = 20;
    }

    // Add lap header
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    const lapLabel = `Lap ${index + 1} - ${lap.startTime}`;
    doc.text(lapLabel, 14, imgY);
    doc.setFont(undefined, 'normal');
    imgY += 8;

    images.forEach((base64Img) => {
      try {
        // Check if we need a new page for this image
        if (imgY > doc.internal.pageSize.getHeight() - 70) {
          doc.addPage();
          imgY = 20;
        }

        // Determine image format from base64 header
        let format = 'JPEG';
        if (base64Img.includes('image/png')) {
          format = 'PNG';
        }

        // Strip the data URL prefix if present
        const imgData = base64Img.includes(',')
          ? base64Img
          : 'data:image/jpeg;base64,' + base64Img;

        // Add image - fit within page width with max dimensions
        const maxWidth = 160;
        const maxHeight = 100;
        doc.addImage(imgData, format, 14, imgY, maxWidth, maxHeight, undefined, 'FAST');
        imgY += maxHeight + 10;
      } catch (e) {
        console.warn('Failed to add image to PDF:', e);
        doc.setFontSize(10);
        doc.text('[Image could not be embedded]', 14, imgY);
        imgY += 10;
      }
    });
  });

  // Trigger the download
  doc.save('laps.pdf');
}

export default downloadPDF;
