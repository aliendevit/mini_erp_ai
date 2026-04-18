import { prisma } from '../prisma';

export async function recalcInvoiceTotals(invoiceId: string) {
  const lines = await prisma.invoiceLine.findMany({ where: { invoiceId } });
  let totalHours = 0;
  let totalAmount = 0;
  for (const l of lines) {
    const h = Number(l.hoursAllocated);
    totalHours += h;
    const amt = l.lineAmount != null ? Number(l.lineAmount) : 0;
    totalAmount += amt;
  }
  // We do not store totals in schema to keep it simple; return them for API.
  return { totalHours, totalAmount };
}
