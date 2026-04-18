import { Router } from 'express';
import { prisma } from '../prisma';
import { computeTimesheetData } from '../utils/timesheet';
import { buildTimesheetPdf } from '../utils/timesheetPdf';
import { buildTimesheetDocx } from '../utils/timesheetWord';

const router = Router();

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

router.get('/', async (req, res) => {
  try {
    const employeeId = String(req.query.employeeId || '').trim();
    const month = toInt(req.query.month);
    const year = toInt(req.query.year);

    if (!employeeId) return res.status(400).json({ message: 'employeeId fehlt.' });

    const data = await computeTimesheetData(prisma, employeeId, year, month);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Fehler.' });
  }
});

router.get('/pdf', async (req, res) => {
  try {
    const employeeId = String(req.query.employeeId || '').trim();
    const month = toInt(req.query.month);
    const year = toInt(req.query.year);

    if (!employeeId) return res.status(400).json({ message: 'employeeId fehlt.' });

    const data = await computeTimesheetData(prisma, employeeId, year, month);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=stundenzettel-${data.employee.lastName}-${year}-${String(month).padStart(2, '0')}.pdf`
    );

    const doc = buildTimesheetPdf(data);
    doc.pipe(res);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ message: e?.message || 'PDF-Export fehlgeschlagen.' });
  }
});

router.get('/word', async (req, res) => {
  try {
    const employeeId = String(req.query.employeeId || '').trim();
    const month = toInt(req.query.month);
    const year = toInt(req.query.year);

    if (!employeeId) return res.status(400).json({ message: 'employeeId fehlt.' });

    const data = await computeTimesheetData(prisma, employeeId, year, month);
    const buf = await buildTimesheetDocx(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=stundenzettel-${data.employee.lastName}-${year}-${String(month).padStart(2, '0')}.docx`
    );
    res.send(buf);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ message: e?.message || 'Word-Export fehlgeschlagen.' });
  }
});

export default router;
