import { Router } from 'express';
import { prisma } from '../prisma';
import { formatInvoiceNumber, getInvoiceSequenceState } from '../utils/invoiceNumber';

const router = Router();

function parseYear(input: any): number {
  const y = Number(input);
  if (!Number.isFinite(y) || y < 2000 || y > 9999) {
    return new Date().getFullYear();
  }
  return Math.floor(y);
}

function parseSeq(input: any): number | null {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

// GET /api/settings/invoice-sequence?year=2026
router.get('/invoice-sequence', async (req, res) => {
  const year = parseYear(req.query.year);

  const state = await prisma.$transaction(async (tx) => {
    const s = await getInvoiceSequenceState(tx as any, year);
    return s;
  });

  res.json({
    ...state,
    effectiveInvoiceNumber: formatInvoiceNumber(year, state.effectiveNextSeq)
  });
});

// PUT /api/settings/invoice-sequence { year?: 2026, nextSeq: 150 }
router.put('/invoice-sequence', async (req, res) => {
  const year = parseYear(req.body?.year);
  const raw = parseSeq(req.body?.nextSeq);

  const result = await prisma.$transaction(async (tx) => {
    const stateBefore = await getInvoiceSequenceState(tx as any, year);

    // Ignore invalid or too-small values.
    const minAllowed = stateBefore.dbNextSeq;
    let desired = raw;
    if (desired == null || desired < minAllowed) {
      desired = minAllowed;
    }
    if (desired > 9999) desired = 9999;

    await (tx as any).invoiceSequence.upsert({
      where: { year },
      create: { year, nextSeq: desired },
      update: { nextSeq: desired }
    });

    const stateAfter = await getInvoiceSequenceState(tx as any, year);
    return stateAfter;
  });

  res.json({
    ...result,
    effectiveInvoiceNumber: formatInvoiceNumber(year, result.effectiveNextSeq)
  });
});

export default router;
