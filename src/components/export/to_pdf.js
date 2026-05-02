import { saveReceiptPdf } from './pdfReceipt';

async function downloadPDF(laps, total_amount, total_minutes, total_laps) {
  await saveReceiptPdf({
    laps,
    title: 'Current Session Receipt',
    subtitle: 'Live export from the active workspace',
    totals: {
      totalAmount: Number(total_amount),
      totalSeconds: Number(total_minutes) * 60,
      totalLaps: total_laps,
    },
    filename: 'current_session_receipt.pdf',
  });
}

export default downloadPDF;
