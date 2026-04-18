import { Router } from 'express';
import { prisma } from '../prisma';
import { buildInvoicePdf } from '../utils/pdf';
import { buildInvoiceDocx } from '../utils/word';
import { handlePrismaDeleteError } from '../utils/errors';
import { createInvoiceWithAutoNumber, ensureInvoiceHasNumberAndDate } from '../utils/invoiceNumber';

const router = Router();

function sumHours(lines: { hoursAllocated: any }[]) {
  return lines.reduce((acc, l) => acc + Number(l.hoursAllocated), 0);
}

function parseYmdToUtcStart(ymd?: string): Date | undefined {
  if (!ymd) return undefined;
  const s = String(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

function endOfUtcDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function buildServiceDateFilter(req: any): { gte?: Date; lte?: Date } | undefined {
  const from = parseYmdToUtcStart(req.query.from as string | undefined);
  const toStart = parseYmdToUtcStart(req.query.to as string | undefined);
  const to = toStart ? endOfUtcDay(toStart) : undefined;
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

// -------- Draft grouping (must come before /:id routes) --------

router.get('/drafts/groups', async (req, res) => {
  const groupBy = (req.query.groupBy as string) || 'employee';
  if (!['employee', 'site', 'order'].includes(groupBy)) {
    return res.status(400).json({ message: 'Ungültiges groupBy.' });
  }

  const serviceDate = buildServiceDateFilter(req);
  const where: any = { status: 'draft' };
  if (serviceDate) {
    where.lines = { some: { serviceDate } };
  }

  const linesInc: any = { include: { workEntry: { include: { employee: true, site: true, order: true } } } };
  if (serviceDate) {
    linesInc.where = { serviceDate };
  }

  const drafts = await prisma.invoice.findMany({
    where,
    include: { customer: true, lines: linesInc }
  });

  const groups = new Map<string, { keyId: string; keyName: string; totalHours: number; invoiceCount: number }>();

  for (const inv of drafts) {
    if (inv.lines.length === 0) continue;
    const first = inv.lines[0].workEntry;
    const keyId = groupBy === 'employee' ? first.employeeId : groupBy === 'site' ? first.siteId : first.orderId;
    const keyName =
      groupBy === 'employee'
        ? `${first.employee.firstName} ${first.employee.lastName}`
        : groupBy === 'site'
          ? first.site.siteName
          : first.order.title;

    const hours = sumHours(inv.lines);
    const g = groups.get(keyId) || { keyId, keyName, totalHours: 0, invoiceCount: 0 };
    g.totalHours += hours;
    g.invoiceCount += 1;
    groups.set(keyId, g);
  }

  res.json({ groupBy, groups: Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours) });
});

router.get('/drafts/group', async (req, res) => {
  const groupBy = (req.query.groupBy as string) || 'employee';
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ message: 'key fehlt.' });
  if (!['employee', 'site', 'order'].includes(groupBy)) {
    return res.status(400).json({ message: 'Ungültiges groupBy.' });
  }

  const serviceDate = buildServiceDateFilter(req);
  const workEntryWhere: any =
    groupBy === 'employee' ? { employeeId: key } : groupBy === 'site' ? { siteId: key } : { orderId: key };
  const lineWhere: any = { ...(serviceDate ? { serviceDate } : {}), workEntry: workEntryWhere };

  const drafts = await prisma.invoice.findMany({
    where: { status: 'draft', lines: { some: lineWhere } } as any,
    include: {
      customer: true,
      lines: {
        where: lineWhere,
        include: { workEntry: { include: { employee: true, site: true, order: true } } }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const keyName = drafts[0]?.lines[0]?.workEntry
    ? groupBy === 'employee'
      ? `${drafts[0].lines[0].workEntry.employee.firstName} ${drafts[0].lines[0].workEntry.employee.lastName}`
      : groupBy === 'site'
        ? drafts[0].lines[0].workEntry.site.siteName
        : drafts[0].lines[0].workEntry.order.title
    : '—';

  res.json({
    groupBy,
    key,
    keyName,
    invoices: drafts.map((inv) => ({
      id: inv.id,
      customer: inv.customer,
      createdAt: inv.createdAt,
      lineCount: inv.lines.length,
      totalHours: sumHours(inv.lines),
      lines: inv.lines
    }))
  });
});

router.post('/merge', async (req, res) => {
  const b = req.body || {};
  const groupBy = b.groupBy as string;
  const key = b.key as string;
  const sourceInvoiceIds: string[] = b.sourceInvoiceIds || [];
  const splits: number[] | undefined = b.splits;

  if (!['employee', 'site', 'order'].includes(groupBy)) return res.status(400).json({ message: 'Ungültiges groupBy.' });
  if (!key) return res.status(400).json({ message: 'key fehlt.' });
  if (!Array.isArray(sourceInvoiceIds) || sourceInvoiceIds.length < 1) return res.status(400).json({ message: 'sourceInvoiceIds fehlt.' });

  const src = await prisma.invoice.findMany({
    where: { id: { in: sourceInvoiceIds } },
    include: { lines: { include: { workEntry: { include: { employee: true, site: true, order: true } } } } }
  });

  if (src.length !== sourceInvoiceIds.length) return res.status(400).json({ message: 'Mindestens eine Rechnung wurde nicht gefunden.' });
  if (src.some((i) => i.status !== 'draft')) return res.status(409).json({ message: 'Nur Entwurf-Rechnungen können zusammengeführt werden.' });

  const customerId = src[0].customerId;
  for (const inv of src) {
    if (inv.customerId !== customerId) {
      return res.status(409).json({ message: 'Zusammenführen nicht möglich: Rechnungen haben unterschiedliche Kunden.' });
    }
    if (inv.lines.length === 0) {
      return res.status(409).json({ message: 'Zusammenführen nicht möglich: Leere Rechnung.' });
    }
    for (const l of inv.lines) {
      const we = l.workEntry;
      const keyId = groupBy === 'employee' ? we.employeeId : groupBy === 'site' ? we.siteId : we.orderId;
      if (keyId !== key) {
        return res.status(409).json({ message: 'Zusammenführen nicht möglich: Gruppe passt nicht.' });
      }
    }
  }

  const sourceLines = src
    .flatMap((inv) =>
      inv.lines.map((l) => ({
        sourceInvoiceId: inv.id,
        workEntryId: l.workEntryId,
        serviceDate: l.serviceDate,
        description: l.description,
        hours: Number(l.hoursAllocated),
        rate: l.unitRate != null ? Number(l.unitRate) : 0
      }))
    )
    .sort((a, b) => a.serviceDate.getTime() - b.serviceDate.getTime());

  const totalHours = sourceLines.reduce((a, l) => a + l.hours, 0);

  const outSplits = (splits && splits.length > 0) ? splits.map(Number) : [totalHours];
  const sumSplits = outSplits.reduce((a, x) => a + x, 0);
  if (Math.abs(sumSplits - totalHours) > 0.01) {
    return res.status(400).json({ message: `Summe der Splits (${sumSplits.toFixed(2)}) muss Total (${totalHours.toFixed(2)}) entsprechen.` });
  }
  if (outSplits.some((x) => x <= 0)) {
    return res.status(400).json({ message: 'Splits müssen > 0 sein.' });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const newInvoices = [] as { id: string }[];
      for (let i = 0; i < outSplits.length; i++) {
        const issueDate = new Date();
        const inv = await createInvoiceWithAutoNumber(
          tx,
          {
            // Merged invoices are considered "issued" and MUST consume an invoice number.
            status: 'final',
            customerId,
            issueDate,
            periodStart: null,
            periodEnd: null,
            notes: null
          },
          issueDate.getFullYear()
        );
        newInvoices.push({ id: inv.id });
      }

      let outIdx = 0;
      let remainingSplit = outSplits[outIdx];

      for (const l of sourceLines) {
        let remainingLine = l.hours;
        while (remainingLine > 0.0001) {
          const take = Math.min(remainingLine, remainingSplit);
          const rate = l.rate;
          await tx.invoiceLine.create({
            data: {
              invoiceId: newInvoices[outIdx].id,
              workEntryId: l.workEntryId,
              serviceDate: l.serviceDate,
              description: l.description || null,
              hoursAllocated: take.toFixed(2),
              unitRate: rate ? rate.toFixed(2) : null,
              lineAmount: rate ? (rate * take).toFixed(2) : null
            }
          });

          remainingLine -= take;
          remainingSplit -= take;

          if (remainingSplit <= 0.0001 && outIdx < newInvoices.length - 1) {
            outIdx += 1;
            remainingSplit = outSplits[outIdx];
          }
        }
      }

      // Remove sources (lines first, then invoices)
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: sourceInvoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: sourceInvoiceIds } } });

      return newInvoices;
    });

    res.json({ ok: true, createdInvoiceIds: created.map((i) => i.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Zusammenführen fehlgeschlagen.' });
  }
});

// -------- Standard invoice CRUD --------

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const serviceDate = buildServiceDateFilter(req);
  // Default behaviour: show only issued invoices (no drafts) on /invoices.
  // Drafts are managed via /invoices/drafts.
  const where: any = status ? { status: status as any } : { status: { not: 'draft' } };
  if (serviceDate) {
    where.lines = { some: { serviceDate } };
  }

  const linesInc: any = serviceDate ? { where: { serviceDate } } : true;

  const invoices = await prisma.invoice.findMany({
    where,
    include: { customer: true, lines: linesInc },
    orderBy: { createdAt: 'desc' }
  });

  const payload = invoices.map((inv) => ({
    ...inv,
    totalHours: sumHours(inv.lines as any),
    lineCount: (inv.lines as any).length
  }));

  res.json(payload);
});

router.get('/:id/pdf/pauschal', async (req, res) => {
  const base = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!base) return res.status(404).json({ message: 'Nicht gefunden.' });
  if (base.status === 'draft') {
    return res.status(409).json({ message: 'Export ist erst nach dem Zusammenführen / Finalisieren möglich.' });
  }

  if (!base.invoiceNumber || !base.issueDate) {
    await ensureInvoiceHasNumberAndDate(prisma, base.id);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: base.id },
    include: { customer: true, lines: { include: { workEntry: { include: { employee: true, order: true, site: true } } } } }
  });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=invoice-${inv.id}-pauschal.pdf`);
  const doc = buildInvoicePdf(inv as any, { kind: 'pauschal' });
  doc.pipe(res);
});

router.get('/:id/pdf', async (req, res) => {
  const base = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!base) return res.status(404).json({ message: 'Nicht gefunden.' });
  if (base.status === 'draft') {
    return res.status(409).json({ message: 'Export ist erst nach dem Zusammenführen / Finalisieren möglich.' });
  }

  if (!base.invoiceNumber || !base.issueDate) {
    await ensureInvoiceHasNumberAndDate(prisma, base.id);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: base.id },
    include: { customer: true, lines: { include: { workEntry: { include: { employee: true, order: true, site: true } } } } }
  });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=invoice-${inv.id}.pdf`);
  const doc = buildInvoicePdf(inv as any, { kind: 'detailed' });
  doc.pipe(res);
});

router.get('/:id/word/pauschal', async (req, res) => {
  const base = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!base) return res.status(404).json({ message: 'Nicht gefunden.' });
  if (base.status === 'draft') {
    return res.status(409).json({ message: 'Export ist erst nach dem Zusammenführen / Finalisieren möglich.' });
  }

  if (!base.invoiceNumber || !base.issueDate) {
    await ensureInvoiceHasNumberAndDate(prisma, base.id);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: base.id },
    include: { customer: true, lines: { include: { workEntry: { include: { employee: true, order: true, site: true } } } } }
  });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });

  try {
    const buf = await buildInvoiceDocx(inv as any, { kind: 'pauschal' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${inv.id}-pauschal.docx`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Word-Export fehlgeschlagen.' });
  }
});

router.get('/:id/word', async (req, res) => {
  const base = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!base) return res.status(404).json({ message: 'Nicht gefunden.' });
  if (base.status === 'draft') {
    return res.status(409).json({ message: 'Export ist erst nach dem Zusammenführen / Finalisieren möglich.' });
  }

  if (!base.invoiceNumber || !base.issueDate) {
    await ensureInvoiceHasNumberAndDate(prisma, base.id);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: base.id },
    include: { customer: true, lines: { include: { workEntry: { include: { employee: true, order: true, site: true } } } } }
  });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });

  try {
    const buf = await buildInvoiceDocx(inv as any, { kind: 'detailed' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${inv.id}.docx`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Word-Export fehlgeschlagen.' });
  }
});

router.get('/:id', async (req, res) => {
  const base = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!base) return res.status(404).json({ message: 'Nicht gefunden.' });

  // IMPORTANT: Draft invoices must not consume invoice numbers.
  // Only issued invoices (non-draft) are ensured to have invoiceNumber + issueDate.
  if (base.status !== 'draft' && (!base.invoiceNumber || !base.issueDate)) {
    await ensureInvoiceHasNumberAndDate(prisma, base.id);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: base.id },
    include: { customer: true, lines: { include: { workEntry: { include: { employee: true, order: true, site: true } } } } }
  });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json({ ...inv, totalHours: sumHours(inv.lines) });
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: b.status || undefined,
        issueDate: b.issueDate ? new Date(b.issueDate) : null,
        notes: b.notes || null,
        pauschalAmount:
          b.pauschalAmount === null || b.pauschalAmount === undefined || b.pauschalAmount === ''
            ? null
            : String(b.pauschalAmount)
      }
    });

    // If user switches a draft to an issued status, assign invoiceNumber once.
    if (updated.status !== 'draft' && (!updated.invoiceNumber || !updated.issueDate)) {
      await ensureInvoiceHasNumberAndDate(prisma, updated.id);
      const ensured = await prisma.invoice.findUnique({ where: { id: updated.id } });
      return res.json(ensured ?? updated);
    }

    res.json(updated);
  } catch (e) {
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return res.status(404).json({ message: 'Nicht gefunden.' });
  if (inv.status !== 'draft') return res.status(409).json({ message: 'Nur Entwurf-Rechnungen können gelöscht werden.' });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Rechnung');
  }
});

export default router;
