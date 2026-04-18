import fs from 'fs';
import path from 'path';
import {
  AlignmentType,
  BorderStyle,
  Document,
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

import type { TimesheetData } from './timesheet';

const FONT = 'Helvetica';

function run(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    size: opts.size ?? 20, // 10pt
    font: FONT
  });
}

function noCellBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
  return { top: none, bottom: none, left: none, right: none };
}

function noTableBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
  return { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none };
}

function boxBorders() {
  const b = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const;
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
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

export async function buildTimesheetDocx(data: TimesheetData): Promise<Buffer> {
  const logo = readLogoBuffer();

  // Top block: logo right + company name under it
  const topLeft = new TableCell({
    borders: noCellBorders(),
    verticalAlign: VerticalAlign.TOP,
    width: { size: 6500, type: WidthType.DXA },
    children: [new Paragraph({ children: [run('')], spacing: { after: 0 } })]
  });

  const topRightChildren: Paragraph[] = [];
  if (logo) {
    topRightChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new ImageRun({ data: logo, transformation: { width: 90, height: 90 } })],
        spacing: { after: 80 }
      })
    );
  }
  topRightChildren.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [run('Z&M Deco Bremen', { bold: false, size: 20 })],
      spacing: { after: 120 }
    })
  );

  const topRight = new TableCell({
    borders: noCellBorders(),
    verticalAlign: VerticalAlign.TOP,
    width: { size: 3800, type: WidthType.DXA },
    children: topRightChildren
  });

  const topTable = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [new TableRow({ children: [topLeft, topRight] })]
  });

  // Second header line: left "Stunden Zettel..." right "Name: ..."
  const headerLine = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noCellBorders(),
            width: { size: 6500, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [run(`Stunden Zettel: ${data.monthName} ${data.year}`, { bold: true })],
                spacing: { after: 120 }
              })
            ]
          }),
          new TableCell({
            borders: noCellBorders(),
            width: { size: 3800, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run(`Name: ${data.employee.lastName}`, { bold: true })],
                spacing: { after: 120 }
              })
            ]
          })
        ]
      })
    ]
  });

  // Main table header row (multi-line for Arbeitszeit)
  const th = (textLines: string[], widthDxa: number) =>
    new TableCell({
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: widthDxa, type: WidthType.DXA },
      children: textLines.map((t, idx) =>
        new Paragraph({
          children: [run(t, { bold: false, size: 18 })],
          spacing: { after: idx === textLines.length - 1 ? 0 : 0 }
        })
      )
    });

  const td = (text: string, widthDxa: number) =>
    new TableCell({
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: widthDxa, type: WidthType.DXA },
      children: [new Paragraph({ children: [run(text, { size: 18 })] })]
    });

  // widths similar to PDF
  const w1 = 2600;
  const w2 = 3700;
  const w3 = 2000;
  const w4 = 2000;

  const headerRow = new TableRow({
    children: [
      th([data.monthName], w1),
      th(['Arbeitszeit', '(Abzüglich Pause)'], w2),
      th(['Beginn'], w3),
      th(['Ende'], w4)
    ]
  });

  const bodyRows = data.rows.map(
    (r) =>
      new TableRow({
        children: [td(r.dateLabel, w1), td(r.workLabel, w2), td(r.begin, w3), td(r.end, w4)]
      })
  );

  const mainTable = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: boxBorders(),
    rows: [headerRow, ...bodyRows]
  });

  const footerTotal = new Paragraph({
    children: [run(`Gesamtstunden: ${data.totalHoursLabel} Std`, { bold: true })],
    spacing: { before: 240, after: 120 }
  });

  const footerSigns = new Table({
    width: { size: 10300, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noCellBorders(),
            width: { size: 5150, type: WidthType.DXA },
            children: [new Paragraph({ children: [run('Arbeitsnehmer:')], spacing: { after: 0 } })]
          }),
          new TableCell({
            borders: noCellBorders(),
            width: { size: 5150, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run('Arbeitsgeber:')],
                spacing: { after: 0 }
              })
            ]
          })
        ]
      })
    ]
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [topTable, headerLine, mainTable, footerTotal, footerSigns]
      }
    ]
  });

  return Packer.toBuffer(doc);
}
