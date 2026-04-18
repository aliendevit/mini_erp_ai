import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError } from '../utils/errors';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await prisma.employee.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const item = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const item = await prisma.employee.create({
    data: {
      firstName: String(b.firstName || '').trim(),
      lastName: String(b.lastName || '').trim(),
      birthDate: b.birthDate ? new Date(b.birthDate) : null,
      street: b.street || null,
      zipCode: b.zipCode || null,
      city: b.city || null,
      phone: b.phone || null,
      email: b.email || null,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
      defaultHourlyRate: b.defaultHourlyRate != null && b.defaultHourlyRate !== '' ? b.defaultHourlyRate : null
    }
  });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        firstName: String(b.firstName || '').trim(),
        lastName: String(b.lastName || '').trim(),
        birthDate: b.birthDate ? new Date(b.birthDate) : null,
        street: b.street || null,
        zipCode: b.zipCode || null,
        city: b.city || null,
        phone: b.phone || null,
        email: b.email || null,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
        defaultHourlyRate: b.defaultHourlyRate != null && b.defaultHourlyRate !== '' ? b.defaultHourlyRate : null
      }
    });
    res.json(item);
  } catch (e) {
    res.status(400).json({ message: 'Aktualisierung fehlgeschlagen.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Mitarbeiter', 'Bitte zuerst verknüpfte Zuordnungen/Arbeitszeiten löschen.');
  }
});

export default router;
