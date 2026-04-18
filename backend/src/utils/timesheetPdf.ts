import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { TimesheetData } from './timesheet';

function drawRect(doc: PDFDocument, x: number, y: number, w: number, h: number) {
  doc.save();
  doc.lineWidth(1);
  doc.rect(x, y, w, h).stroke();
  doc.restore();
}

export function buildTimesheetPdf(data: TimesheetData) {
  // Smaller margins so 31-day months fit on one page nicely
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  const margin = 40;
  const pageW = doc.page.width;
  const pageH = doc.page.height;

  // --- Top: logo right (smaller) ---
  const logoPath = path.join(process.cwd(), 'assets', 'zmd-deco-logo.png');
  const logoW = 75;
  const logoX = pageW - margin - logoW;
  const logoY = margin - 6;

  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, logoX, logoY, { width: logoW });
    } catch {
      // ignore
    }
  }

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  doc.text('Z&M Deco Bremen', pageW - margin - 200, logoY + logoW + 4, { width: 200, align: 'right' });

  // --- Header line below (slightly tighter) ---
  const headerY = logoY + logoW + 22;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Stunden Zettel: ${data.monthName} ${data.year}`, margin, headerY, { width: 320 });
  doc.text(`Name: ${data.employee.lastName}`, pageW - margin - 260, headerY, { width: 260, align: 'right' });

  // --- Table ---
  const tableX = margin;
  const tableY = headerY + 14; // tighter spacing
  const tableW = pageW - margin * 2;

  // column widths tuned for A4 portrait like the sample
  const col1 = 130;
  const col2 = 185;
  const col3 = 90;
  const col4 = tableW - (col1 + col2 + col3);

  // smaller to ensure 31 rows + footer fits one page
  const headerH = 30;
  const rowH = 16;

  const totalRows = data.rows.length;
  const tableH = headerH + totalRows * rowH;

  drawRect(doc, tableX, tableY, tableW, tableH);

  // vertical lines
  const x1 = tableX + col1;
  const x2 = x1 + col2;
  const x3 = x2 + col3;

  doc.moveTo(x1, tableY).lineTo(x1, tableY + tableH).stroke();
  doc.moveTo(x2, tableY).lineTo(x2, tableY + tableH).stroke();
  doc.moveTo(x3, tableY).lineTo(x3, tableY + tableH).stroke();

  // header line
  doc.moveTo(tableX, tableY + headerH).lineTo(tableX + tableW, tableY + headerH).stroke();

  // header texts (smaller)
  doc.font('Helvetica').fontSize(8);

  doc.text(data.monthName, tableX + 6, tableY + 9, { width: col1 - 12 });

  doc.text('Arbeitszeit', x1 + 6, tableY + 6, { width: col2 - 12 });
  doc.text('(Abzüglich Pause)', x1 + 6, tableY + 16, { width: col2 - 12 });

  doc.text('Beginn', x2 + 6, tableY + 9, { width: col3 - 12 });
  doc.text('Ende', x3 + 6, tableY + 9, { width: col4 - 12 });

  // rows (smaller)
  doc.font('Helvetica').fontSize(8);
  for (let i = 0; i < totalRows; i++) {
    const r = data.rows[i];
    const y = tableY + headerH + i * rowH;

    // horizontal row lines
    doc.moveTo(tableX, y + rowH).lineTo(tableX + tableW, y + rowH).stroke();

    doc.text(r.dateLabel, tableX + 6, y + 4, { width: col1 - 12 });
    doc.text(r.workLabel, x1 + 6, y + 4, { width: col2 - 12 });
    doc.text(r.begin, x2 + 6, y + 4, { width: col3 - 12 });
    doc.text(r.end, x3 + 6, y + 4, { width: col4 - 12 });
  }

  // --- Footer (kept on same page) ---
  const footerY = tableY + tableH + 12;

  doc.font('Helvetica-Bold').fontSize(9);
  doc.text(`Gesamtstunden: ${data.totalHoursLabel} Std`, margin, footerY);

  doc.font('Helvetica').fontSize(9);
  const sigY = footerY + 18;
  doc.text('Arbeitsnehmer:', margin, sigY, { width: 260 });
  doc.text('Arbeitsgeber:', pageW - margin - 260, sigY, { width: 260, align: 'right' });

  // keep cursor inside page end
  doc.text('', margin, pageH - margin - 5);

  doc.end();
  return doc;
}
