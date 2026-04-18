import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError } from '../utils/errors';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await prisma.order.findMany({
    include: { customer: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const item = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      sites: { orderBy: { createdAt: 'asc' }, include: { assignments: { include: { employee: true } } } }
    }
  });
  if (!item) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const item = await prisma.order.create({
    data: {
      customerId: b.customerId,
      orderNumber: b.orderNumber || null,
      title: String(b.title || '').trim(),
      description: b.description || null,
      status: b.status || 'open',
      startDate: b.startDate ? new Date(b.startDate) : null,
      endDate: b.endDate ? new Date(b.endDate) : null,
      defaultHourlyRate: b.defaultHourlyRate != null && b.defaultHourlyRate !== '' ? b.defaultHourlyRate : null,
      currency: b.currency || 'EUR'
    }
  });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        customerId: b.customerId,
        orderNumber: b.orderNumber || null,
        title: String(b.title || '').trim(),
        description: b.description || null,
        status: b.status || 'open',
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        defaultHourlyRate: b.defaultHourlyRate != null && b.defaultHourlyRate !== '' ? b.defaultHourlyRate : null,
        currency: b.currency || 'EUR'
      }
    });
    res.json(item);
  } catch (e) {
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Auftrag', 'Bitte zuerst Baustellen/Arbeitszeiten löschen.');
  }
});

export default router;
