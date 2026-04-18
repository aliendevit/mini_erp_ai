import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError, isPrismaKnownError } from '../utils/errors';

const router = Router();

router.get('/', async (req, res) => {
  const siteId = req.query.siteId as string | undefined;
  const where = siteId ? { siteId } : undefined;
  const items = await prisma.employeeAssignment.findMany({
    where,
    include: { employee: true, site: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(items);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.employeeAssignment.create({
      data: {
        employeeId: b.employeeId,
        siteId: b.siteId,
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        notes: b.notes || null
      },
      include: { employee: true }
    });
    res.status(201).json(item);
  } catch (e) {
    if (isPrismaKnownError(e) && e.code === 'P2002') {
      return res.status(409).json({ message: 'Diese Zuordnung existiert bereits.' });
    }
    res.status(400).json({ message: 'Erstellen fehlgeschlagen.' });
  }
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.employeeAssignment.update({
      where: { id: req.params.id },
      data: {
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        notes: b.notes || null
      }
    });
    res.json(item);
  } catch (e) {
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.employeeAssignment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Zuordnung');
  }
});

export default router;
