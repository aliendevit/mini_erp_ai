import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError } from '../utils/errors';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await prisma.site.findMany({
    include: { order: { include: { customer: true } }, assignments: { include: { employee: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const item = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: { order: { include: { customer: true } }, assignments: { include: { employee: true } } }
  });
  if (!item) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const item = await prisma.site.create({
    data: {
      orderId: b.orderId,
      siteName: String(b.siteName || '').trim(),
      street: b.street || null,
      zipCode: b.zipCode || null,
      city: b.city || null,
      notes: b.notes || null,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : true
    }
  });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.site.update({
      where: { id: req.params.id },
      data: {
        orderId: b.orderId,
        siteName: String(b.siteName || '').trim(),
        street: b.street || null,
        zipCode: b.zipCode || null,
        city: b.city || null,
        notes: b.notes || null,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : true
      }
    });
    res.json(item);
  } catch (e) {
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.site.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Baustelle', 'Bitte zuerst Arbeitszeiten/Zuordnungen löschen.');
  }
});

export default router;
