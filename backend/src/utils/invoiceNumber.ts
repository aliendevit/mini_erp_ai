import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient;

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

function yyFromYear(year: number): string {
  return String(year % 100).padStart(2, '0');
}

export function formatInvoiceNumber(year: number, seq: number): string {
  return `RE ${yyFromYear(year)}-${pad4(seq)}`;
}

export async function getNextInvoiceNumberForYear(tx: Tx, year: number): Promise<string> {
  const yy = yyFromYear(year);
  const prefix = `RE ${yy}-`;

  // Lexicographic order works because suffix is always 4 digits.
  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' }
  });

  const lastSeq = last?.invoiceNumber ? Number(String(last.invoiceNumber).slice(-4)) : 0;
  const dbNextSeq = lastSeq + 1;

  // Optional override (e.g. to continue an existing manual series).
  // We only respect it if it is >= dbNextSeq; otherwise we ignore it.
  const seqRow = await tx.invoiceSequence.findUnique({ where: { year } });
  const configuredNextSeq = seqRow?.nextSeq ?? null;

  const nextSeq = Math.max(dbNextSeq, configuredNextSeq ?? 0);

  if (nextSeq > 9999) {
    throw new Error(`Invoice sequence exceeded for year ${year}.`);
  }
  return formatInvoiceNumber(year, nextSeq);
}

/** Returns components for UI / settings display. */
export async function getInvoiceSequenceState(tx: Tx, year: number): Promise<{
  year: number;
  dbNextSeq: number;
  configuredNextSeq: number | null;
  effectiveNextSeq: number;
}> {
  const yy = yyFromYear(year);
  const prefix = `RE ${yy}-`;

  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' }
  });

  const lastSeq = last?.invoiceNumber ? Number(String(last.invoiceNumber).slice(-4)) : 0;
  const dbNextSeq = lastSeq + 1;
  const seqRow = await tx.invoiceSequence.findUnique({ where: { year } });
  const configuredNextSeq = seqRow?.nextSeq ?? null;
  const effectiveNextSeq = Math.max(dbNextSeq, configuredNextSeq ?? 0);

  return { year, dbNextSeq, configuredNextSeq, effectiveNextSeq };
}

function isUniqueInvoiceNumberError(e: any): boolean {
  // Prisma unique constraint error code
  return Boolean(e && typeof e === 'object' && e.code === 'P2002');
}

/**
 * Creates an invoice with an automatically generated invoiceNumber (RE YY-XXXX) and default issueDate.
 * Retries a few times on rare concurrent unique conflicts.
 */
export async function createInvoiceWithAutoNumber(
  tx: Tx,
  data: Omit<Prisma.InvoiceUncheckedCreateInput, 'invoiceNumber' | 'issueDate'> & {
    issueDate?: Date | null;
  },
  year: number
): Promise<Prisma.InvoiceGetPayload<{}>> {
  const issueDate = data.issueDate ?? new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber = await getNextInvoiceNumberForYear(tx, year);
    try {
      // Do not allow passing invoiceNumber from outside.
      const inv = await tx.invoice.create({
        data: {
          ...data,
          invoiceNumber,
          issueDate
        } as any
      });
      return inv;
    } catch (e: any) {
      if (isUniqueInvoiceNumberError(e)) continue;
      throw e;
    }
  }

  throw new Error('Failed to generate unique invoice number after retries.');
}

/**
 * Ensures an existing invoice has invoiceNumber and issueDate.
 * - issueDate defaults to invoice.createdAt (date/time preserved)
 * - numbering is per-year based on issueDate
 */
export async function ensureInvoiceHasNumberAndDate(
  prisma: PrismaClient,
  invoiceId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) return;

    const issueDate = inv.issueDate ?? inv.createdAt;
    const year = issueDate.getFullYear();

    if (inv.invoiceNumber && inv.issueDate) return;

    const invoiceNumber = inv.invoiceNumber ?? (await getNextInvoiceNumberForYear(tx, year));

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber,
        issueDate
      }
    });
  });
}
