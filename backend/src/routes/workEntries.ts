import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError } from '../utils/errors';

const router = Router();

type DayType = 'work' | 'sick' | 'vacation' | 'holiday';

function asDateOnly(value: any): Date {
  if (typeof value === 'string' && value.length >= 10) {
    return new Date(value.substring(0, 10) + 'T00:00:00.000Z');
  }
  return new Date(value);
}

function normalizeDayType(body: any): DayType {
  const t = String(body?.dayType || '').toLowerCase().trim();
  if (t === 'work' || t === 'arbeit') return 'work';
  if (t === 'sick' || t === 'krank') return 'sick';
  if (t === 'vacation' || t === 'urlaub') return 'vacation';
  if (t === 'holiday' || t === 'feiertag') return 'holiday';

  // backward compatibility: old checkbox
  if (body?.isSick === true) return 'sick';

  return 'work';
}

async function computeRate(employeeId: string, orderId: string) {
  const [emp, order] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.order.findUnique({ where: { id: orderId } })
  ]);
  const r = order?.defaultHourlyRate ?? emp?.defaultHourlyRate;
  return r ? Number(r) : 0;
}

/**
 * Draft invoices MUST NOT consume invoice numbers.
 * They exist only as containers for invoice lines until the user merges/finalizes them.
 */
async function createDraftInvoice(tx: any, customerId: string) {
  return tx.invoice.create({
    data: {
      status: 'draft',
      customerId,
      invoiceNumber: null,
      issueDate: null,
      periodStart: null,
      periodEnd: null,
      notes: null
    }
  });
}

router.get('/', async (_req, res) => {
  const items = await prisma.workEntry.findMany({
    include: {
      employee: true,
      order: { include: { customer: true } },
      site: true,
      invoiceLines: { include: { invoice: true } }
    },
    orderBy: { workDate: 'desc' }
  });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const item = await prisma.workEntry.findUnique({
    where: { id: req.params.id },
    include: {
      employee: true,
      order: { include: { customer: true } },
      site: true,
      invoiceLines: { include: { invoice: true } }
    }
  });
  if (!item) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const workDate = asDateOnly(b.workDate);
  const employeeId = b.employeeId;
  const orderId = b.orderId;
  const siteId = b.siteId;

  const [site, order] = await Promise.all([
    prisma.site.findUnique({ where: { id: siteId } }),
    prisma.order.findUnique({ where: { id: orderId } })
  ]);
  if (!site || !order) return res.status(400).json({ message: 'Ungültige Auswahl (Auftrag/Baustelle).' });
  if (site.orderId !== orderId) return res.status(400).json({ message: 'Die Baustelle gehört nicht zum Auftrag.' });

  const dayType = normalizeDayType(b);
  const isAbsence = dayType !== 'work';

  let hoursNum = Number(b.hours);
  if (isAbsence) {
    hoursNum = 0;
  } else {
    if (!hoursNum || hoursNum <= 0) return res.status(400).json({ message: 'Stunden müssen > 0 sein.' });
  }

  const isSick = dayType === 'sick';
  const rate = isAbsence ? 0 : await computeRate(employeeId, orderId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const we = await tx.workEntry.create({
        data: {
          workDate,
          employeeId,
          orderId,
          siteId,
          hours: String(hoursNum),
          dayType,
          isSick,
          description: b.description || null
        }
      });

      // For sick/vacation/holiday: DO NOT create draft invoice
      if (isAbsence) {
        return { workEntry: we, invoice: null };
      }

      const inv = await createDraftInvoice(tx, order.customerId);

      await tx.invoiceLine.create({
        data: {
          invoiceId: inv.id,
          workEntryId: we.id,
          serviceDate: workDate,
          description: b.description || null,
          hoursAllocated: String(hoursNum),
          unitRate: rate ? String(rate) : null,
          lineAmount: rate ? String(rate * hoursNum) : null
        }
      });

      return { workEntry: we, invoice: inv };
    });

    res.status(201).json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: 'Erstellen fehlgeschlagen.' });
  }
});

async function canModifyWorkEntry(workEntryId: string) {
  const lines = await prisma.invoiceLine.findMany({
    where: { workEntryId },
    include: { invoice: true }
  });
  if (lines.length === 0) return { ok: true as const };
  if (lines.length !== 1) {
    return {
      ok: false as const,
      reason: 'Diese Arbeitszeit ist auf mehrere Rechnungen verteilt und kann nicht geändert/gelöscht werden.'
    };
  }
  const inv = lines[0].invoice;
  if (inv.status !== 'draft') {
    return {
      ok: false as const,
      reason: 'Diese Arbeitszeit ist bereits in einer nicht-Entwurf-Rechnung enthalten und kann nicht geändert/gelöscht werden.'
    };
  }
  return { ok: true as const, invoiceLineId: lines[0].id, invoiceId: inv.id };
}

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const check = await canModifyWorkEntry(id);
  if (!check.ok) return res.status(409).json({ message: check.reason });

  const workDate = asDateOnly(b.workDate);
  const employeeId = b.employeeId;
  const orderId = b.orderId;
  const siteId = b.siteId;

  const [site, order] = await Promise.all([
    prisma.site.findUnique({ where: { id: siteId } }),
    prisma.order.findUnique({ where: { id: orderId } })
  ]);
  if (!site || !order) return res.status(400).json({ message: 'Ungültige Auswahl (Auftrag/Baustelle).' });
  if (site.orderId !== orderId) return res.status(400).json({ message: 'Die Baustelle gehört nicht zum Auftrag.' });

  const dayType = normalizeDayType(b);
  const isAbsence = dayType !== 'work';

  let hoursNum = Number(b.hours);
  if (isAbsence) {
    hoursNum = 0;
  } else {
    if (!hoursNum || hoursNum <= 0) return res.status(400).json({ message: 'Stunden müssen > 0 sein.' });
  }

  const isSick = dayType === 'sick';
  const rate = isAbsence ? 0 : await computeRate(employeeId, orderId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const we = await tx.workEntry.update({
        where: { id },
        data: {
          workDate,
          employeeId,
          orderId,
          siteId,
          hours: String(hoursNum),
          dayType,
          isSick,
          description: b.description || null
        }
      });

      // CASE A: there is an invoice line already (entry was work before)
      if (check.invoiceLineId && check.invoiceId) {
        if (isAbsence) {
          // switch work -> (sick/vacation/holiday): remove invoice line and delete invoice if empty
          await tx.invoiceLine.delete({ where: { id: check.invoiceLineId } });
          const remaining = await tx.invoiceLine.count({ where: { invoiceId: check.invoiceId } });
          if (remaining === 0) {
            await tx.invoice.delete({ where: { id: check.invoiceId } });
          }
          return we;
        }

        // still work: update invoice line + ensure invoice customer matches order
        await tx.invoiceLine.update({
          where: { id: check.invoiceLineId },
          data: {
            serviceDate: workDate,
            description: b.description || null,
            hoursAllocated: String(hoursNum),
            unitRate: rate ? String(rate) : null,
            lineAmount: rate ? String(rate * hoursNum) : null
          }
        });

        await tx.invoice.update({
          where: { id: check.invoiceId },
          data: { customerId: order.customerId }
        });

        return we;
      }

      // CASE B: no invoice line exists (entry was absence before, or legacy)
      if (isAbsence) {
        // absence stays absence: nothing else
        return we;
      }

      // switch (absence -> work): create invoice + line
      const inv = await createDraftInvoice(tx, order.customerId);

      await tx.invoiceLine.create({
        data: {
          invoiceId: inv.id,
          workEntryId: we.id,
          serviceDate: workDate,
          description: b.description || null,
          hoursAllocated: String(hoursNum),
          unitRate: rate ? String(rate) : null,
          lineAmount: rate ? String(rate * hoursNum) : null
        }
      });

      return we;
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const check = await canModifyWorkEntry(id);
  if (!check.ok) return res.status(409).json({ message: check.reason });

  try {
    await prisma.$transaction(async (tx) => {
      // if linked draft invoice line exists, remove it (and delete invoice if empty)
      if (check.invoiceLineId && check.invoiceId) {
        const line = await tx.invoiceLine.findUnique({ where: { id: check.invoiceLineId } });
        if (line) {
          await tx.invoiceLine.delete({ where: { id: line.id } });
          const remaining = await tx.invoiceLine.count({ where: { invoiceId: line.invoiceId } });
          if (remaining === 0) {
            await tx.invoice.delete({ where: { id: line.invoiceId } });
          }
        }
      }

      // delete work entry (also works for absence entries with no invoice line)
      await tx.workEntry.delete({ where: { id } });
    });

    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Arbeitszeit');
  }
});

export default router;
