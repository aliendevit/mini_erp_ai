import { Router } from 'express';
import { prisma } from '../prisma';

const router = Router();

function parseYmdToUtcStart(ymd?: string): Date | undefined {
  if (!ymd) return undefined;
  const s = String(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

function endOfUtcDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
}

router.get('/hours', async (req, res) => {
  const groupBy = (req.query.groupBy as string) || 'employee';
  if (!['employee', 'site', 'order'].includes(groupBy)) {
    return res.status(400).json({ message: 'Ungültiges groupBy.' });
  }

  const from = parseYmdToUtcStart(req.query.from as string | undefined);
  const toStart = parseYmdToUtcStart(req.query.to as string | undefined);
  const to = toStart ? endOfUtcDay(toStart) : undefined;
  const dateWhere = (from || to)
    ? {
        workDate: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {})
        }
      }
    : {};

  const entries = await prisma.workEntry.findMany({
    where: dateWhere as any,
    include: { employee: true, site: true, order: true },
    orderBy: { workDate: 'desc' }
  });

  const map = new Map<string, { keyId: string; keyName: string; totalHours: number }>();

  for (const we of entries) {
    const keyId = groupBy === 'employee' ? we.employeeId : groupBy === 'site' ? we.siteId : we.orderId;
    const keyName = groupBy === 'employee'
      ? `${we.employee.firstName} ${we.employee.lastName}`
      : groupBy === 'site'
        ? we.site.siteName
        : we.order.title;

    const g = map.get(keyId) || { keyId, keyName, totalHours: 0 };
    g.totalHours += Number(we.hours);
    map.set(keyId, g);
  }

  res.json({ groupBy, rows: Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours) });
});

export default router;
