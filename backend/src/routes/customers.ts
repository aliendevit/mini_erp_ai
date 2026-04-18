import { Router } from 'express';
import { prisma } from '../prisma';
import { handlePrismaDeleteError } from '../utils/errors';

const router = Router();

router.get('/', async (_req, res) => {
  const items = await prisma.customer.findMany({ orderBy: { companyName: 'asc' } });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const item = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ message: 'Nicht gefunden.' });
  res.json(item);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const item = await prisma.customer.create({
    data: {
      companyName: String(b.companyName || '').trim(),
      street: b.street || null,
      zipCode: b.zipCode || null,
      city: b.city || null,
      country: b.country || 'DE',
      vatId: b.vatId || null,
      contactName: b.contactName || null,
      contactPhone: b.contactPhone || null,
      contactEmail: b.contactEmail || null,
      notes: b.notes || null
    }
  });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const item = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        companyName: String(b.companyName || '').trim(),
        street: b.street || null,
        zipCode: b.zipCode || null,
        city: b.city || null,
        country: b.country || 'DE',
        vatId: b.vatId || null,
        contactName: b.contactName || null,
        contactPhone: b.contactPhone || null,
        contactEmail: b.contactEmail || null,
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
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    return handlePrismaDeleteError(res, e, 'Kunde', 'Bitte zuerst verknüpfte Aufträge/Rechnungen löschen.');
  }
});

export default router;
