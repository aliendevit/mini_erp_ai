import fs from 'fs';
import path from 'path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from 'docx';

import type { InvoiceForPdf } from './pdf';

type DocKind = 'detailed' | 'pauschal';

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

const FONT = 'Helvetica';

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

function safeText(s?: string | null) {
  return (s ?? '').trim();
}

function pickIssueDate(invoice: InvoiceForPdf): Date {
  return (invoice as any).issueDate ? new Date((invoice as any).issueDate) : new Date();
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

function formatMoneyEUR(amount: number) {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatMoneyUi(amount: number) {
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toFixed(2)} €`;
}

function run(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    size: opts.size ?? 20, // 10pt
    font: FONT
  });
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: AlignmentType; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spacingAfter ?? 0 },
    children: [run(text, { bold: opts.bold, size: opts.size })]
  });
}

function noCellBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
  return {
    top: none,
    bottom: none,
    left: none,
    right: none
  };
}

function noTableBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
  return {
    top: none,
    bottom: none,
    left: none,
    right: none,
    insideH: none,
    insideV: none
  };
}

function boxBorders() {
  const b = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const;
  return {
    top: b,
    bottom: b,
    left: b,
    right: b,
    insideH: b,
    insideV: b
  };
}

function readLogoBuffer(): Buffer | null {
  const logoPath = path.join(process.cwd(), 'assets', 'zmd-deco-logo.png');
  try {
    if (fs.existsSync(logoPath)) return fs.readFileSync(logoPath);
  } catch {
    // ignore
  }
  return null;
}

function buildHeader(invoice: InvoiceForPdf) {
  const logo = readLogoBuffer();

  const titleCell = new TableCell({
    borders: noCellBorders(),
    verticalAlign: VerticalAlign.TOP,
    width: { size: 5200, type: WidthType.DXA },
    children: [
      new Paragraph({
        children: [run('KUNDENRECHNUNG', { bold: true, size: 32 })],
        spacing: { after: 0 }
      })
    ]
  });

  const sellerChildren: Paragraph[] = [];

  if (logo) {
    sellerChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            data: logo,
            transformation: { width: 115, height: 115 }
          })
        ],
        spacing: { after: 80 }
      })
    );
  }

  sellerChildren.push(p(SELLER.name, { align: AlignmentType.RIGHT }));
  sellerChildren.push(p(SELLER.street, { align: AlignmentType.RIGHT }));
  sellerChildren.push(p(SELLER.zipCity, { align: AlignmentType.RIGHT }));
  sellerChildren.push(p(SELLER.phone, { align: AlignmentType.RIGHT }));
  sellerChildren.push(p(SELLER.email, { align: AlignmentType.RIGHT }));

  const sellerCell = new TableCell({
    borders: noCellBorders(),
    verticalAlign: VerticalAlign.TOP,
    width: { size: 5100, type: WidthType.DXA },
    children: sellerChildren
  });

  const headerTable = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [new TableRow({ children: [titleCell, sellerCell] })]
  });

  const cust = (invoice as any).customer;
  const customerParas: Paragraph[] = [];
  customerParas.push(p(safeText(cust?.companyName) || '—', { size: 22 }));
  const street = safeText(cust?.street);
  if (street) customerParas.push(p(street));
  const zipCity = [safeText(cust?.zipCode), safeText(cust?.city)].filter(Boolean).join(' ');
  if (zipCity) customerParas.push(p(zipCity));

  return { headerTable, customerParas };
}

function buildMetaLine(invoice: InvoiceForPdf) {
  const issue = pickIssueDate(invoice);
  const invNo = safeText((invoice as any).invoiceNumber) || '—';

  const left = new TableCell({
    borders: noCellBorders(),
    width: { size: 5200, type: WidthType.DXA },
    children: [p(`Rechnung Nummer: ${invNo}`, { bold: true })]
  });

  const right = new TableCell({
    borders: noCellBorders(),
    width: { size: 5100, type: WidthType.DXA },
    children: [p(`Rechnungsdatum: ${formatDateDDMMYY(issue)}`, { bold: true, align: AlignmentType.RIGHT })]
  });

  return new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [new TableRow({ children: [left, right] })]
  });
}

function buildProjectBox(invoice: InvoiceForPdf) {
  const lines = ((invoice as any).lines ?? []) as any[];

  const sites = Array.from(new Set(lines.map((l) => safeText(l.workEntry?.site?.siteName)).filter(Boolean)));
  const siteLabel = sites.length ? sites.join(', ') : '—';

  const serviceDates = lines
    .map((l) => (l.serviceDate ? new Date(l.serviceDate) : null))
    .filter(Boolean) as Date[];
  serviceDates.sort((a, b) => a.getTime() - b.getTime());

  const period =
    serviceDates.length
      ? `${formatDateDDMMYY(serviceDates[0])}-${formatDateDDMMYY(serviceDates[serviceDates.length - 1])}`
      : '—';

  const orderDesc =
    safeText(lines.find((l) => safeText(l.workEntry?.order?.description))?.workEntry?.order?.description) ||
    safeText(lines[0]?.workEntry?.order?.title) ||
    '—';

  const cust = (invoice as any).customer;
  const contact = safeText(cust?.contactName) || safeText(cust?.companyName) || '—';

  const bulletText = `• ${orderDesc}`;
  const festpreisLine = `Zum Festpreis laut Absprache vor Ort mit Herrn ${contact}`;

  const col1W = 2800;
  const col2W = 7500;

  const row1 = new TableRow({
    children: [
      new TableCell({ width: { size: col1W, type: WidthType.DXA }, children: [p('Baustelle', { bold: true })] }),
      new TableCell({ width: { size: col2W, type: WidthType.DXA }, children: [p(siteLabel)] })
    ]
  });

  const row2 = new TableRow({
    children: [
      new TableCell({ width: { size: col1W, type: WidthType.DXA }, children: [p('Ausfürungszeitraum:', { bold: true })] }),
      new TableCell({ width: { size: col2W, type: WidthType.DXA }, children: [p(period)] })
    ]
  });

  const row3 = new TableRow({
    children: [new TableCell({ columnSpan: 2, children: [p(bulletText), p(festpreisLine)] })]
  });

  return new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: boxBorders(),
    rows: [row1, row2, row3]
  });
}

function buildPositionsTable(invoice: InvoiceForPdf) {
  const lines = (((invoice as any).lines ?? []) as any[]).slice().sort((a, b) => {
    const da = a.serviceDate ? new Date(a.serviceDate).getTime() : 0;
    const db = b.serviceDate ? new Date(b.serviceDate).getTime() : 0;
    if (da !== db) return da - db;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

  const widths = {
    date: 1200,
    desc: 2000,
    emp: 1500,
    order: 1500,
    site: 1000,
    hours: 900,
    rate: 900,
    amount: 1300
  };

  const headerRow = new TableRow({
    children: [
      new TableCell({ width: { size: widths.date, type: WidthType.DXA }, children: [p('Datum', { bold: true })] }),
      new TableCell({ width: { size: widths.desc, type: WidthType.DXA }, children: [p('Beschreibung', { bold: true })] }),
      new TableCell({ width: { size: widths.emp, type: WidthType.DXA }, children: [p('Mitarbeiter', { bold: true })] }),
      new TableCell({ width: { size: widths.order, type: WidthType.DXA }, children: [p('Auftrag', { bold: true })] }),
      new TableCell({ width: { size: widths.site, type: WidthType.DXA }, children: [p('Baustelle', { bold: true })] }),
      new TableCell({ width: { size: widths.hours, type: WidthType.DXA }, children: [p('Stunden', { bold: true, align: AlignmentType.RIGHT })] }),
      new TableCell({ width: { size: widths.rate, type: WidthType.DXA }, children: [p('Satz', { bold: true, align: AlignmentType.RIGHT })] }),
      new TableCell({ width: { size: widths.amount, type: WidthType.DXA }, children: [p('Betrag', { bold: true, align: AlignmentType.RIGHT })] })
    ]
  });

  let totalHours = 0;
  let totalAmount = 0;

  const dataRows: TableRow[] = [];

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

    dataRows.push(
      new TableRow({
        children: [
          new TableCell({ width: { size: widths.date, type: WidthType.DXA }, children: [p(dateStr)] }),
          new TableCell({ width: { size: widths.desc, type: WidthType.DXA }, children: [p(desc)] }),
          new TableCell({ width: { size: widths.emp, type: WidthType.DXA }, children: [p(emp)] }),
          new TableCell({ width: { size: widths.order, type: WidthType.DXA }, children: [p(order)] }),
          new TableCell({ width: { size: widths.site, type: WidthType.DXA }, children: [p(site)] }),
          new TableCell({ width: { size: widths.hours, type: WidthType.DXA }, children: [p(hours.toFixed(2), { align: AlignmentType.RIGHT })] }),
          new TableCell({ width: { size: widths.rate, type: WidthType.DXA }, children: [p(formatMoneyUi(rate), { align: AlignmentType.RIGHT })] }),
          new TableCell({ width: { size: widths.amount, type: WidthType.DXA }, children: [p(formatMoneyUi(amount), { align: AlignmentType.RIGHT })] })
        ]
      })
    );
  }

  const table = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: boxBorders(),
    rows: [headerRow, ...dataRows]
  });

  const totalsTable = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: noCellBorders(), width: { size: 6300, type: WidthType.DXA }, children: [p('')] }),
          new TableCell({ borders: noCellBorders(), width: { size: 2000, type: WidthType.DXA }, children: [p('Summe Stunden:', { bold: true, align: AlignmentType.RIGHT })] }),
          new TableCell({ borders: noCellBorders(), width: { size: 2000, type: WidthType.DXA }, children: [p(totalHours.toFixed(2), { align: AlignmentType.RIGHT })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ borders: noCellBorders(), width: { size: 6300, type: WidthType.DXA }, children: [p('')] }),
          new TableCell({ borders: noCellBorders(), width: { size: 2000, type: WidthType.DXA }, children: [p('Summe Betrag:', { bold: true, align: AlignmentType.RIGHT })] }),
          new TableCell({ borders: noCellBorders(), width: { size: 2000, type: WidthType.DXA }, children: [p(formatMoneyUi(totalAmount), { align: AlignmentType.RIGHT })] })
        ]
      })
    ]
  });

  return { table, totalsTable };
}

function buildPauschalLine(invoice: InvoiceForPdf) {
  const computed = (((invoice as any).lines ?? []) as any[]).reduce((a, l) => a + computeLineAmount(l), 0);
  const agreed = (invoice as any).pauschalAmount != null ? Number((invoice as any).pauschalAmount) : null;
  const amount = agreed != null ? agreed : computed;

  return new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: noCellBorders(), width: { size: 7000, type: WidthType.DXA }, children: [p('Zum vereinbarten Pauschalpreis', { bold: true })] }),
          new TableCell({ borders: noCellBorders(), width: { size: 3300, type: WidthType.DXA }, children: [p(formatMoneyEUR(amount), { bold: true, align: AlignmentType.RIGHT })] })
        ]
      })
    ]
  });
}

function buildLegalText(invoice: InvoiceForPdf) {
  const issue = pickIssueDate(invoice);
  const due = new Date(issue.getTime() + 10 * 24 * 60 * 60 * 1000);
  const payLine = `Zahlbar: Rein Nettokasse bis zum ${formatDateDDMMYY(due)} nach Rechnungsstellung.`;

  const paras: Paragraph[] = [];
  paras.push(new Paragraph({ children: [run(payLine)], spacing: { after: 160 } }));

  paras.push(
    new Paragraph({
      children: [
        run('Gemäß § 13b UStG geht die Umsatzsteuerschuld auf den Auftraggeber/Rechnungsempfänger'),
        new TextRun({ text: 'über. Es besteht Steuerschuldnerschaft des Leistungsempfängers!', break: 1, font: FONT, size: 20 })
      ],
      spacing: { after: 160 }
    })
  );

  paras.push(
    new Paragraph({
      children: [
        run('Privatpersonen, wie auch Unternehmer, die Leistungen für ihren nichtunternehmerischen Bereich'),
        new TextRun({ text: 'beziehen, haben eine Rechnungsaufbewahrungspflicht von 2 Jahren!', break: 1, font: FONT, size: 20 })
      ],
      spacing: { after: 260 }
    })
  );

  paras.push(new Paragraph({ children: [run('Wir freuen uns, mit Ihnen gemeinsam arbeiten zu dürfen!')], spacing: { after: 0 } }));

  return paras;
}

function buildFooter() {
  const line = new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
    spacing: { before: 100, after: 120 },
    children: []
  });

  const paras = FOOTER_LINES.map(
    (l) => new Paragraph({ children: [new TextRun({ text: l, font: FONT, size: 16 })], spacing: { after: 60 } })
  );

  return new Footer({ children: [line, ...paras] });
}

export async function buildInvoiceDocx(invoice: InvoiceForPdf, opts: { kind?: DocKind } = {}): Promise<Buffer> {
  const kind: DocKind = opts.kind ?? 'detailed';

  const { headerTable, customerParas } = buildHeader(invoice);
  const meta = buildMetaLine(invoice);
  const projectBox = buildProjectBox(invoice);

  const children: any[] = [];

  children.push(headerTable);
  children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  children.push(...customerParas);
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

  children.push(meta);
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

  children.push(projectBox);
  children.push(new Paragraph({ children: [], spacing: { after: 220 } }));

  if (kind === 'pauschal') {
    children.push(buildPauschalLine(invoice));
    children.push(new Paragraph({ children: [], spacing: { after: 140 } }));
    children.push(...buildLegalText(invoice));
  } else {
    const { table, totalsTable } = buildPositionsTable(invoice);
    children.push(table);
    children.push(new Paragraph({ children: [], spacing: { after: 140 } }));
    children.push(totalsTable);
    children.push(new Paragraph({ children: [], spacing: { after: 220 } }));
    children.push(...buildLegalText(invoice));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 800, bottom: 800, left: 800, right: 800 } }
        },
        footers: { default: buildFooter() },
        children
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
