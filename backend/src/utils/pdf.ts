import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: {
    customer: true;
    lines: {
      include: {
        workEntry: {
          include: { employee: true; order: true; site: true };
        };
      };
    };
  };
}>;

type PdfKind = 'detailed' | 'pauschal';

const SELLER = {
  name: 'Z & M Deco Bremen',
  street: 'Georg-Gleistein-Str. 7',
  zipCity: '28757 Bremen',
  phone: '016/21775100',
  email: 'Zyadkarkour@gmail.com'
};

const FOOTER_LINES = [
  'Geschäftsführer: Zyad Karkour * Georg-Gleistein-Straße 7 * 28757 Bremen * Tel: 01621775100',
  'Bankverbindung: Die Sparkasse Bremen BIC: SBREDE22XXX IBAN: DE06 2905 0101 0083 6017 08',
  '',
  'Freistellungsbescheinigung zu Steuerabzug bei Bauleistungen §48 b, Absatz 1, Satz 1, ESTG liegt vor',
  'Finanzamt Bremen – Mitte, Steuernummer: 60/288/24293 – Ust-ID-Nr.: DE3592929773'
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateDDMMYY(d: Date) {
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yy = pad2(d.getFullYear() % 100);
  return `${dd}.${mm}.${yy}`;
}

function formatDateYYYYMMDD(d: Date) {
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoneyEUR(amount: number) {
  // "4.400,00 €"
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// UI-like money formatting used in the "Positionen" table (matches the table in Rechnungen -> öffnen)
function formatMoneyUi(amount: number) {
  // "220.00 €"
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toFixed(2)} €`;
}

function safeText(s?: string | null) {
  return (s ?? '').trim();
}

function pickIssueDate(invoice: InvoiceForPdf): Date {
  return invoice.issueDate ? new Date(invoice.issueDate) : new Date();
}

function computeLineRate(line: any): number {
  const we = line.workEntry;
  const fromLine = line.unitRate != null ? Number(line.unitRate) : undefined;
  const fromOrder = we?.order?.defaultHourlyRate != null ? Number(we.order.defaultHourlyRate) : undefined;
  const fromEmp = we?.employee?.defaultHourlyRate != null ? Number(we.employee.defaultHourlyRate) : undefined;
  return fromLine ?? fromOrder ?? fromEmp ?? 0;
}

function computeLineAmount(line: any): number {
  if (line.lineAmount != null) return Number(line.lineAmount);
  const hours = Number(line.hoursAllocated);
  const rate = computeLineRate(line);
  return rate ? hours * rate : 0;
}

function addFooter(doc: PDFDocument, margin: number) {
  const y = doc.page.height - 120;
  doc.save();
  doc.lineWidth(1);
  doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();

  doc.font('Helvetica').fontSize(8).fillColor('#000');
  let yy = y + 8;
  for (const line of FOOTER_LINES) {
    doc.text(line, margin, yy, { width: doc.page.width - margin * 2 });
    yy += 11;
  }
  doc.restore();
}

function ensureSpace(doc: PDFDocument, neededHeight: number, margin: number) {
  const bottomLimit = doc.page.height - 130; // leave room for footer
  if (doc.y + neededHeight > bottomLimit) {
    addFooter(doc, margin);
    doc.addPage();
    doc.y = margin;
  }
}

function addHeaderBlocks(doc: PDFDocument, invoice: InvoiceForPdf, margin: number) {
  const logoPath = path.join(process.cwd(), 'assets', 'zmd-deco-logo.png');

  // Title (top-left)
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000');
  doc.text('KUNDENRECHNUNG', margin, margin);

  // Seller block (top-right) — put address UNDER the logo
  const rightW = 210;
  const rightX = doc.page.width - margin - rightW;
  const logoW = 115;
  const logoX = doc.page.width - margin - logoW;
  const logoY = margin - 4;
  let sellerY = margin + 2;

  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, logoX, logoY, { width: logoW });
      sellerY = logoY + logoW + 8;
    } catch {
      // ignore image errors
    }
  }

  // IMPORTANT: align seller text to the RIGHT (same right edge as the logo)
  doc.font('Helvetica').fontSize(10);
  doc.text(SELLER.name, rightX, sellerY, { width: rightW, align: 'right' });
  sellerY += 14;
  doc.text(SELLER.street, rightX, sellerY, { width: rightW, align: 'right' });
  sellerY += 14;
  doc.text(SELLER.zipCity, rightX, sellerY, { width: rightW, align: 'right' });
  sellerY += 14;
  doc.text(SELLER.phone, rightX, sellerY, { width: rightW, align: 'right' });
  sellerY += 14;
  doc.text(SELLER.email, rightX, sellerY, { width: rightW, align: 'right' });

  // Customer block (left)
  const cust = invoice.customer;
  const custY = margin + 58;

  doc.font('Helvetica').fontSize(11).fillColor('#000');
  doc.text(safeText(cust.companyName) || '—', margin, custY);

  doc.fontSize(10);
  const street = safeText(cust.street);
  if (street) doc.text(street, margin, doc.y + 2);

  const zipCity = [safeText(cust.zipCode), safeText(cust.city)].filter(Boolean).join(' ');
  if (zipCity) doc.text(zipCity, margin, doc.y + 2);

  // move below header blocks (customer + seller), with enough clearance
  const afterCustomerY = doc.y;
  const afterSellerY = sellerY + 12;
  doc.y = Math.max(afterCustomerY, afterSellerY) + 10;
}

function addInvoiceMetaLine(doc: PDFDocument, invoice: InvoiceForPdf, margin: number) {
  const issue = pickIssueDate(invoice);
  const invNo = safeText(invoice.invoiceNumber) || '—';

  const y = doc.y;
  // Make both labels and values bold
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

  doc.text(`Rechnung Nummer: ${invNo}`, margin, y, { width: 320 });

  doc.text(`Rechnungsdatum: ${formatDateDDMMYY(issue)}`, doc.page.width - margin - 260, y, {
    width: 260,
    align: 'right'
  });

  doc.moveDown(1.2);
}

function drawRectTableFrame(doc: PDFDocument, x: number, y: number, w: number, h: number) {
  doc.save();
  doc.lineWidth(1);
  doc.rect(x, y, w, h).stroke();
  doc.restore();
}

/**
 * First (project) box:
 * - MUST match the Pauschal layout in BOTH PDFs.
 * - 3rd row is a MERGED row.
 * - Show bullet (from Auftrag.description) + Festpreis line inside the merged row.
 */
function buildProjectBox(doc: PDFDocument, invoice: InvoiceForPdf, margin: number) {
  const x = margin;
  const w = doc.page.width - margin * 2;

  const rowH1 = 26;
  const rowH2 = 26;

  const lines = invoice.lines ?? [];

  const sites = Array.from(new Set(lines.map((l: any) => safeText(l.workEntry?.site?.siteName)).filter(Boolean)));
  const siteLabel = sites.length ? sites.join(', ') : '—';

  const serviceDates = lines
    .map((l: any) => new Date(l.serviceDate))
    .sort((a, b) => a.getTime() - b.getTime());
  const period =
    serviceDates.length
      ? `${formatDateDDMMYY(serviceDates[0])}-${formatDateDDMMYY(serviceDates[serviceDates.length - 1])}`
      : '—';

  // Always prefer the Auftragsbeschreibung (Order.description)
  const orderDesc =
    safeText(lines.find((l: any) => safeText(l.workEntry?.order?.description))?.workEntry?.order?.description) ||
    safeText(lines[0]?.workEntry?.order?.title) ||
    '—';

  const split = x + 140;

  doc.font('Helvetica').fontSize(10);

  const contact = safeText(invoice.customer.contactName) || safeText(invoice.customer.companyName) || '—';
  const festpreisLine = `Zum Festpreis laut Absprache vor Ort mit Herrn ${contact}`;
  const bulletText = `• ${orderDesc}`;

  const rowTextW = w - 20;
  const bulletH = doc.heightOfString(bulletText, { width: rowTextW });
  const festpreisH = doc.heightOfString(festpreisLine, { width: rowTextW });

  // Row 3 is merged and contains BOTH bullet + Festpreis line.
  const rowH3 = Math.max(44, bulletH + festpreisH + 14);

  const h = rowH1 + rowH2 + rowH3;

  ensureSpace(doc, h + 20, margin);

  const y = doc.y;

  drawRectTableFrame(doc, x, y, w, h);

  // horizontal lines
  doc.moveTo(x, y + rowH1).lineTo(x + w, y + rowH1).stroke();
  doc.moveTo(x, y + rowH1 + rowH2).lineTo(x + w, y + rowH1 + rowH2).stroke();

  // vertical split only for first 2 rows (row 3 merged)
  doc.moveTo(split, y).lineTo(split, y + rowH1 + rowH2).stroke();

  // labels
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Baustelle', x + 10, y + 7, { width: 120 });
  doc.text('Ausfürungszeitraum:', x + 10, y + rowH1 + 7, { width: 120 });

  // values
  doc.font('Helvetica').fontSize(10);
  doc.text(siteLabel, split + 10, y + 7, { width: w - 140 - 20 });
  doc.text(period, split + 10, y + rowH1 + 7, { width: w - 140 - 20 });

  // merged row 3
  const row3Y = y + rowH1 + rowH2 + 7;
  doc.text(bulletText, x + 10, row3Y, { width: w - 20 });
  doc.text(festpreisLine, x + 10, doc.y + 2, { width: w - 20 });

  doc.y = y + h + 14;
}

/**
 * Detailed PDF second table MUST match the UI table under "Positionen":
 * Datum | Beschreibung | Mitarbeiter | Auftrag | Baustelle | Stunden | Satz | Betrag
 */
function buildPositionsTable(doc: PDFDocument, invoice: InvoiceForPdf, margin: number) {
  const x = margin;
  const w = doc.page.width - margin * 2; // A4 usable width

  // Column widths tuned to exactly fit w=515 (A4 with margin 40)
  const colW = {
    date: 60,
    desc: 100,
    emp: 80,
    order: 80,
    site: 50,
    hours: 45,
    rate: 45,
    amount: 55
  };

  const headerH = 22;
  const minRowH = 22;
  const cellPadY = 6;
  const bottomLimit = doc.page.height - 130;


  const lines = ((invoice.lines as any[]) ?? []).slice().sort((a, b) => {
    const da = a.serviceDate ? new Date(a.serviceDate).getTime() : 0;
    const db = b.serviceDate ? new Date(b.serviceDate).getTime() : 0;
    if (da !== db) return da - db;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

  let totalHours = 0;
  let totalAmount = 0;

  // start slightly below current cursor
  let y = doc.y + 2;

  const drawHeader = () => {
    // If header doesn't fit, go to next page
    if (y + headerH > bottomLimit) {
      addFooter(doc, margin);
      doc.addPage();
      y = margin;
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

    let xx = x;
    doc.text('Datum', xx, y + 6, { width: colW.date, lineBreak: false });
    xx += colW.date;
    doc.text('Beschreibung', xx, y + 6, { width: colW.desc, lineBreak: false });
    xx += colW.desc;
    doc.text('Mitarbeiter', xx, y + 6, { width: colW.emp, lineBreak: false });
    xx += colW.emp;
    doc.text('Auftrag', xx, y + 6, { width: colW.order, lineBreak: false });
    xx += colW.order;
    doc.text('Baustelle', xx, y + 6, { width: colW.site, lineBreak: false });
    xx += colW.site;
    doc.text('Stunden', xx, y + 6, { width: colW.hours, align: 'right', lineBreak: false });
    xx += colW.hours;
    doc.text('Satz', xx, y + 6, { width: colW.rate, align: 'right', lineBreak: false });
    xx += colW.rate;
    doc.text('Betrag', xx, y + 6, { width: colW.amount, align: 'right', lineBreak: false });

    doc.save();
    doc.lineWidth(1);
    doc.moveTo(x, y + headerH).lineTo(x + w, y + headerH).stroke();
    doc.restore();

    y += headerH;

    doc.font('Helvetica').fontSize(10).fillColor('#000');
  };

  drawHeader();

  for (const line of lines) {
    const we = line.workEntry;

    const dateStr = line.serviceDate ? formatDateYYYYMMDD(new Date(line.serviceDate)) : '—';
    const desc = safeText(line.description) || safeText(we?.description) || '—';
    const emp = we?.employee ? `${we.employee.firstName} ${we.employee.lastName}` : '—';
    const order = safeText(we?.order?.title) || '—';
    const site = safeText(we?.site?.siteName) || '—';

    const hours = Number(line.hoursAllocated ?? 0);
    const rate = computeLineRate(line);
    const amount = computeLineAmount(line);

    totalHours += hours;
    totalAmount += amount;

    // --- NEW: compute dynamic row height (based on wrapping text) ---
    // Use same font as drawing
    doc.font('Helvetica').fontSize(10).fillColor('#000');

    const hDate = doc.heightOfString(dateStr, { width: colW.date });
    const hDesc = doc.heightOfString(desc, { width: colW.desc });
    const hEmp = doc.heightOfString(emp, { width: colW.emp });
    const hOrder = doc.heightOfString(order, { width: colW.order }); // this one often wraps
    const hSite = doc.heightOfString(site, { width: colW.site });

    const hHours = doc.heightOfString(hours.toFixed(2), { width: colW.hours });
    const hRate = doc.heightOfString(formatMoneyUi(rate), { width: colW.rate });
    const hAmount = doc.heightOfString(formatMoneyUi(amount), { width: colW.amount });

    const contentH = Math.max(hDate, hDesc, hEmp, hOrder, hSite, hHours, hRate, hAmount);
    const rowH = Math.max(minRowH, Math.ceil(contentH + cellPadY * 2));

    // page break if needed (now uses dynamic rowH)
    if (y + rowH > bottomLimit) {
      addFooter(doc, margin);
      doc.addPage();
      y = margin;
      drawHeader();
    }

    // --- draw cells ---
    let xx = x;

    // Allow wrapping for Beschreibung/Auftrag to prevent overlaps; others keep single-line.
    doc.text(dateStr, xx, y + cellPadY, { width: colW.date });
    xx += colW.date;

    doc.text(desc, xx, y + cellPadY, { width: colW.desc });
    xx += colW.desc;

    doc.text(emp, xx, y + cellPadY, { width: colW.emp });
    xx += colW.emp;

    doc.text(order, xx, y + cellPadY, { width: colW.order }); // wraps if needed
    xx += colW.order;

    doc.text(site, xx, y + cellPadY, { width: colW.site });
    xx += colW.site;

    doc.text(hours.toFixed(2), xx, y + cellPadY, { width: colW.hours, align: 'right' });
    xx += colW.hours;

    doc.text(formatMoneyUi(rate), xx, y + cellPadY, { width: colW.rate, align: 'right' });
    xx += colW.rate;

    doc.text(formatMoneyUi(amount), xx, y + cellPadY, { width: colW.amount, align: 'right' });

    // horizontal row line at the NEW row height
    doc.save();
    doc.lineWidth(1);
    doc.moveTo(x, y + rowH).lineTo(x + w, y + rowH).stroke();
    doc.restore();

    y += rowH;
}

  // Totals line (like the UI: "Summe Stunden" and "Summe Betrag" on the right)
  if (y + 22 > bottomLimit) {
    addFooter(doc, margin);
    doc.addPage();
    y = margin;
    drawHeader();
  }

  const totalsY = y + 8;

  const hoursBlockW = 210;
  const amountBlockW = 210;
  const valueW = 85;

  const xHours = x + w - (hoursBlockW + amountBlockW);
  const xAmount = x + w - amountBlockW;

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Summe Stunden:', xHours, totalsY, { width: hoursBlockW - valueW, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(10);
  doc.text(totalHours.toFixed(2), xHours + (hoursBlockW - valueW), totalsY, {
    width: valueW,
    align: 'right',
    lineBreak: false
  });

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Summe Betrag:', xAmount, totalsY, { width: amountBlockW - valueW, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(10);
  doc.text(formatMoneyUi(totalAmount), xAmount + (amountBlockW - valueW), totalsY, {
    width: valueW,
    align: 'right',
    lineBreak: false
  });

  // move cursor below totals
  doc.y = totalsY + 18;
}

function addLegalText(doc: PDFDocument, margin: number, payLine: string) {
  ensureSpace(doc, 160, margin);

  doc.font('Helvetica').fontSize(10).fillColor('#000');
  doc.text(payLine, margin, doc.y, { width: doc.page.width - margin * 2 });
  doc.moveDown(1);

  doc.text(
    'Gemäß § 13b UStG geht die Umsatzsteuerschuld auf den Auftraggeber/Rechnungsempfänger\nüber. Es besteht Steuerschuldnerschaft des Leistungsempfängers!',
    margin,
    doc.y,
    { width: doc.page.width - margin * 2 }
  );

  doc.moveDown(1);

  doc.text(
    'Privatpersonen, wie auch Unternehmer, die Leistungen für ihren nichtunternehmerischen Bereich\nbeziehen, haben eine Rechnungsaufbewahrungspflicht von 2 Jahren!',
    margin,
    doc.y,
    { width: doc.page.width - margin * 2 }
  );

  doc.moveDown(2);
  doc.text('Wir freuen uns, mit Ihnen gemeinsam arbeiten zu dürfen!', margin, doc.y, {
    width: doc.page.width - margin * 2
  });
}

export function buildInvoicePdf(invoice: InvoiceForPdf, opts: { kind?: PdfKind } = {}): PDFDocument {
  const kind: PdfKind = opts.kind ?? 'detailed';
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  const margin = 40;

  addHeaderBlocks(doc, invoice, margin);
  addInvoiceMetaLine(doc, invoice, margin);

  // First table (project box) — same in BOTH PDFs
  buildProjectBox(doc, invoice, margin);

  if (kind === 'pauschal') {
    const computed = (invoice.lines as any[]).reduce((a, l) => a + computeLineAmount(l), 0);
    const agreed = (invoice as any).pauschalAmount != null ? Number((invoice as any).pauschalAmount) : null;
    const amount = agreed != null ? agreed : computed;

    ensureSpace(doc, 60, margin);

    // Under the table: MUST be on one line (label + amount)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

    const yLine = doc.y;
    const fullW = doc.page.width - margin * 2;
    const amountW = 140;

    doc.text('Zum vereinbarten Pauschalpreis', margin, yLine, {
      width: fullW - amountW,
      lineBreak: false
    });
    doc.text(formatMoneyEUR(amount), margin, yLine, {
      width: fullW,
      align: 'right'
    });
    doc.y = yLine + doc.currentLineHeight();

    doc.moveDown(0.4);

    const issue = pickIssueDate(invoice);
    const due = new Date(issue.getTime() + 10 * 24 * 60 * 60 * 1000);
    const payLine = `Zahlbar: Rein Nettokasse bis zum ${formatDateDDMMYY(due)} nach Rechnungsstellung.`;

    addLegalText(doc, margin, payLine);
  } else {
    // Second table (detailed): MUST match UI "Positionen"
    buildPositionsTable(doc, invoice, margin);

    const issue = pickIssueDate(invoice);
    const due = new Date(issue.getTime() + 10 * 24 * 60 * 60 * 1000);
    const payLine = `Zahlbar: Rein Nettokasse bis zum ${formatDateDDMMYY(due)} nach Rechnungsstellung.`;

    addLegalText(doc, margin, payLine);
  }

  addFooter(doc, margin);
  doc.end();
  return doc;
}