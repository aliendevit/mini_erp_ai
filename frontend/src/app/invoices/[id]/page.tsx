'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useI18n } from '../../../lib/i18n';
import { appConfirm } from '../../../lib/dialog';
import { apiGet, apiJson, openAuthBlob, downloadAuthBlob } from '../../../lib/api';

type Customer = { id: string; companyName: string };
type Employee = { id: string; firstName: string; lastName: string };
type Order = { id: string; title: string };
type Site = { id: string; siteName: string };

type WorkEntry = {
  id: string;
  workDate: string;
  employee: Employee;
  order: Order;
  site: Site;
};

type InvoiceLine = {
  id: string;
  serviceDate: string;
  description?: string | null;
  hoursAllocated: string;
  unitRate?: string | null;
  lineAmount?: string | null;
  workEntry: WorkEntry;
};

type PaymentRecord = {
  id: string;
  type: 'deposit' | 'advance' | 'installment' | 'final' | 'other';
  status: 'planned' | 'received' | 'refunded' | 'canceled';
  amount?: string | number | null;
  currency: string;
  dueDate?: string | null;
  paidDate?: string | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
};

type PaymentSummary = {
  totalAmount: number;
  paidAmount: number;
  depositAmount: number;
  paidToday: number;
  plannedAmount: number;
  refundedAmount: number;
  remainingBalance: number;
};

type Invoice = {
  id: string;
  status: string;
  invoiceNumber?: string | null;
  customer: Customer;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  pauschalAmount?: string | null;
  createdAt: string;
  totalHours?: number;
  totalAmount?: number;
  lines: InvoiceLine[];
  payments?: PaymentRecord[];
  paymentSummary?: PaymentSummary;
};

const paymentCopy = {
  de: {
    heading: 'Zahlungen und Anzahlung',
    description: 'Erfasse Anzahlungen, Teilzahlungen und Zahlungseingang direkt an der Rechnung.',
    paid: 'Bezahlt',
    deposit: 'Anzahlung',
    paidToday: 'Heute bezahlt',
    remaining: 'Offen',
    planned: 'Geplant',
    refunded: 'Rueckerstattet',
    addPayment: 'Zahlung erfassen',
    type: 'Typ',
    status: 'Status',
    amount: 'Betrag',
    currency: 'Waehrung',
    paidDate: 'Zahlungsdatum',
    dueDate: 'Faelligkeit',
    method: 'Zahlungsart',
    reference: 'Referenz',
    notes: 'Zahlungsnotiz',
    history: 'Zahlungsverlauf',
    noPayments: 'Noch keine Zahlungen erfasst.',
    remove: 'Entfernen',
    requiredAmount: 'Bitte Betrag eingeben.',
    added: 'Zahlung gespeichert.',
    deleted: 'Zahlung geloescht.',
    types: { deposit: 'Anzahlung', advance: 'Vorauszahlung', installment: 'Teilzahlung', final: 'Schlusszahlung', other: 'Sonstige' },
    statuses: { planned: 'Geplant', received: 'Erhalten', refunded: 'Rueckerstattet', canceled: 'Storniert' },
  },
  en: {
    heading: 'Payments and deposit',
    description: 'Record deposits, partial payments, and received payments directly on the invoice.',
    paid: 'Paid',
    deposit: 'Deposit',
    paidToday: 'Paid today',
    remaining: 'Remaining',
    planned: 'Planned',
    refunded: 'Refunded',
    addPayment: 'Add payment',
    type: 'Type',
    status: 'Status',
    amount: 'Amount',
    currency: 'Currency',
    paidDate: 'Paid date',
    dueDate: 'Due date',
    method: 'Method',
    reference: 'Reference',
    notes: 'Payment note',
    history: 'Payment history',
    noPayments: 'No payments recorded yet.',
    remove: 'Remove',
    requiredAmount: 'Please enter an amount.',
    added: 'Payment saved.',
    deleted: 'Payment deleted.',
    types: { deposit: 'Deposit', advance: 'Advance', installment: 'Installment', final: 'Final', other: 'Other' },
    statuses: { planned: 'Planned', received: 'Received', refunded: 'Refunded', canceled: 'Canceled' },
  },
  ar: {
    heading: 'الدفعات والعربون',
    description: 'يمكن تسجيل العربون والدفعات الجزئية والدفعات المستلمة مباشرة داخل الفاتورة.',
    paid: 'المدفوع',
    deposit: 'العربون',
    paidToday: 'مدفوع اليوم',
    remaining: 'المتبقي',
    planned: 'المخطط',
    refunded: 'المسترجع',
    addPayment: 'إضافة دفعة',
    type: 'النوع',
    status: 'الحالة',
    amount: 'المبلغ',
    currency: 'العملة',
    paidDate: 'تاريخ الدفع',
    dueDate: 'تاريخ الاستحقاق',
    method: 'طريقة الدفع',
    reference: 'المرجع',
    notes: 'ملاحظة الدفع',
    history: 'سجل الدفعات',
    noPayments: 'لا توجد دفعات مسجلة بعد.',
    remove: 'حذف',
    requiredAmount: 'يرجى إدخال المبلغ.',
    added: 'تم حفظ الدفعة.',
    deleted: 'تم حذف الدفعة.',
    types: { deposit: 'عربون', advance: 'دفعة مقدمة', installment: 'دفعة جزئية', final: 'دفعة نهائية', other: 'أخرى' },
    statuses: { planned: 'مخطط', received: 'مستلم', refunded: 'مسترجع', canceled: 'ملغى' },
  },
} as const;

const paymentTypes = ['deposit', 'advance', 'installment', 'final', 'other'] as const;
const paymentStatuses = ['planned', 'received', 'refunded', 'canceled'] as const;

export default function InvoiceDetailPage() {
  const { locale, messages: m } = useI18n();
  const p = paymentCopy[locale] || paymentCopy.en;
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState({
    type: 'deposit',
    status: 'received',
    amount: '',
    currency: 'EUR',
    paidDate: new Date().toISOString().substring(0, 10),
    dueDate: '',
    method: '',
    reference: '',
    notes: '',
  });

  const totalAmount = useMemo(() => {
    if (!invoice) return 0;
    const lineTotal = invoice.lines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0);
    return lineTotal > 0 ? lineTotal : Number(invoice.pauschalAmount || 0);
  }, [invoice]);

  const paymentSummary = useMemo<PaymentSummary>(() => {
    const fallbackTotal = Number(invoice?.totalAmount ?? totalAmount ?? 0);
    return invoice?.paymentSummary || {
      totalAmount: fallbackTotal,
      paidAmount: 0,
      depositAmount: 0,
      paidToday: 0,
      plannedAmount: 0,
      refundedAmount: 0,
      remainingBalance: fallbackTotal,
    };
  }, [invoice, totalAmount]);

  const formatMoney = (value?: number | string | null, currency = 'EUR') => `${Number(value || 0).toFixed(2)} ${currency}`;

  async function load() {
    const nextInvoice = await apiGet<Invoice>(`/invoices/${id}`);
    setInvoice(nextInvoice);
    setInvoiceNumber(nextInvoice.invoiceNumber || '');
    setStatus(nextInvoice.status);
    setIssueDate(nextInvoice.issueDate ? nextInvoice.issueDate.substring(0, 10) : new Date().toISOString().substring(0, 10));
    setDueDate(nextInvoice.dueDate ? nextInvoice.dueDate.substring(0, 10) : '');
    setNotes(nextInvoice.notes || '');
    setFixedAmount(nextInvoice.pauschalAmount ? String(nextInvoice.pauschalAmount) : '');
  }

  useEffect(() => {
    if (!id) return;
    load().catch((error) => alert(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!invoice) return;
    setLoading(true);
    try {
      await apiJson(`/invoices/${invoice.id}`, 'PUT', {
        status,
        issueDate: issueDate || null,
        dueDate: dueDate || null,
        notes: notes || null,
        pauschalAmount: fixedAmount === '' ? null : Number(fixedAmount),
      });
      await load();
      alert(m.common.updateSuccess);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function del() {
    if (!invoice) return;
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    try {
      await apiJson(`/invoices/${invoice.id}`, 'DELETE');
      router.push('/invoices');
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function addPayment() {
    if (!invoice) return;
    if (paymentDraft.amount === '') return alert(p.requiredAmount);
    setPaymentSaving(true);
    try {
      const nextInvoice = await apiJson<Invoice>(`/invoices/${invoice.id}/payments`, 'POST', {
        type: paymentDraft.type,
        status: paymentDraft.status,
        amount: Number(paymentDraft.amount),
        currency: paymentDraft.currency || 'EUR',
        paidDate: paymentDraft.paidDate || null,
        dueDate: paymentDraft.dueDate || null,
        method: paymentDraft.method || null,
        reference: paymentDraft.reference || null,
        notes: paymentDraft.notes || null,
      });
      setInvoice(nextInvoice);
      setPaymentDraft((current) => ({
        ...current,
        amount: '',
        method: '',
        reference: '',
        notes: '',
        paidDate: new Date().toISOString().substring(0, 10),
        dueDate: '',
      }));
      alert(p.added);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setPaymentSaving(false);
    }
  }

  async function deletePayment(paymentId: string) {
    if (!invoice) return;
    if (!(await appConfirm(m.common.deleteConfirm))) return;
    setPaymentSaving(true);
    try {
      const nextInvoice = await apiJson<Invoice>(`/invoices/${invoice.id}/payments/${paymentId}`, 'DELETE');
      setInvoice(nextInvoice);
      alert(p.deleted);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setPaymentSaving(false);
    }
  }

  async function openDocument(path: string, downloadName?: string) {
    try {
      if (path.endsWith('/word') || path.endsWith('/word/pauschal')) {
        await downloadAuthBlob(path, downloadName);
      } else {
        await openAuthBlob(path);
      }
    } catch (error: any) {
      alert(error.message);
    }
  }

  if (!invoice) {
    return <div className="card"><div className="muted">{m.common.loading}</div></div>;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>{m.invoiceDetailPage.heading}</h2>
          <div className="muted">{m.common.id}: {invoice.id}</div>
          <div className="muted">{m.invoiceDetailPage.customer}: {invoice.customer?.companyName || m.common.none}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn" href="/invoices">{m.common.back}</Link>
          {invoice.status !== 'draft' && (
            <>
              <button className="btn" type="button" onClick={() => openDocument(`/invoices/${invoice.id}/pdf`)}>{m.invoiceDetailPage.detailedPdf}</button>
              <button className="btn" type="button" onClick={() => openDocument(`/invoices/${invoice.id}/pdf/pauschal`)}>{m.invoiceDetailPage.fixedPdf}</button>
              <button className="btn" type="button" onClick={() => openDocument(`/invoices/${invoice.id}/word`, `invoice-${invoice.id}.docx`)}>{m.invoiceDetailPage.detailedWord}</button>
              <button className="btn" type="button" onClick={() => openDocument(`/invoices/${invoice.id}/word/pauschal`, `invoice-${invoice.id}-fixed.docx`)}>{m.invoiceDetailPage.fixedWord}</button>
            </>
          )}
          {invoice.status === 'draft' && <button className="btn danger" onClick={del}>{m.common.delete}</button>}
        </div>
      </div>

      {invoice.status === 'draft' && (
        <>
          <div className="spacer" />
          <div className="muted">{m.invoiceDetailPage.draftHint}</div>
        </>
      )}

      <div className="spacer" />

      <h3>{m.invoiceDetailPage.editHeading}</h3>
      <div className="row">
        <div>
          <label>{m.invoiceDetailPage.invoiceNumber}</label>
          <input value={invoiceNumber} disabled />
        </div>
        <div>
          <label>{m.common.status}</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="draft">{m.statuses.invoice.draft}</option>
            <option value="final">{m.statuses.invoice.final}</option>
            <option value="sent">{m.statuses.invoice.sent}</option>
            <option value="partial_paid">Partial paid</option>
            <option value="paid">{m.statuses.invoice.paid}</option>
            <option value="canceled">{m.statuses.invoice.canceled}</option>
          </select>
        </div>
        <div>
          <label>{m.invoiceDetailPage.issueDate}</label>
          <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
        </div>
        <div>
          <label>Due date</label>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
        <div>
          <label>{m.invoiceDetailPage.fixedAmount}</label>
          <input
            type="number"
            step="0.01"
            value={fixedAmount}
            onChange={(event) => setFixedAmount(event.target.value)}
            placeholder={m.invoiceDetailPage.fixedAmountPlaceholder}
          />
        </div>
      </div>

      <div className="spacer" />
      <div>
        <label>{m.common.notes}</label>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>

      <div className="spacer" />
      <button className="btn primary" onClick={save} disabled={loading}>{m.common.save}</button>

      <div className="spacer" />
      <hr />

      <section className="invoice-payment-panel">
        <div className="invoice-payment-heading">
          <div>
            <h3>{p.heading}</h3>
            <p>{p.description}</p>
          </div>
          <strong>{formatMoney(paymentSummary.remainingBalance)}</strong>
        </div>

        <div className="invoice-payment-metrics">
          <div><span>{p.paid}</span><strong>{formatMoney(paymentSummary.paidAmount)}</strong></div>
          <div><span>{p.deposit}</span><strong>{formatMoney(paymentSummary.depositAmount)}</strong></div>
          <div><span>{p.paidToday}</span><strong>{formatMoney(paymentSummary.paidToday)}</strong></div>
          <div><span>{p.remaining}</span><strong>{formatMoney(paymentSummary.remainingBalance)}</strong></div>
          <div><span>{p.planned}</span><strong>{formatMoney(paymentSummary.plannedAmount)}</strong></div>
          <div><span>{p.refunded}</span><strong>{formatMoney(paymentSummary.refundedAmount)}</strong></div>
        </div>

        <div className="invoice-payment-form">
          <div>
            <label>{p.type}</label>
            <select value={paymentDraft.type} onChange={(event) => setPaymentDraft((current) => ({ ...current, type: event.target.value }))}>
              {paymentTypes.map((type) => <option key={type} value={type}>{p.types[type]}</option>)}
            </select>
          </div>
          <div>
            <label>{p.status}</label>
            <select value={paymentDraft.status} onChange={(event) => setPaymentDraft((current) => ({ ...current, status: event.target.value }))}>
              {paymentStatuses.map((statusValue) => <option key={statusValue} value={statusValue}>{p.statuses[statusValue]}</option>)}
            </select>
          </div>
          <div>
            <label>{p.amount}</label>
            <input type="number" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} />
          </div>
          <div>
            <label>{p.currency}</label>
            <input value={paymentDraft.currency} onChange={(event) => setPaymentDraft((current) => ({ ...current, currency: event.target.value }))} />
          </div>
          <div>
            <label>{p.paidDate}</label>
            <input type="date" value={paymentDraft.paidDate} onChange={(event) => setPaymentDraft((current) => ({ ...current, paidDate: event.target.value }))} />
          </div>
          <div>
            <label>{p.dueDate}</label>
            <input type="date" value={paymentDraft.dueDate} onChange={(event) => setPaymentDraft((current) => ({ ...current, dueDate: event.target.value }))} />
          </div>
          <div>
            <label>{p.method}</label>
            <input value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))} />
          </div>
          <div>
            <label>{p.reference}</label>
            <input value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} />
          </div>
          <div className="invoice-payment-note">
            <label>{p.notes}</label>
            <textarea value={paymentDraft.notes} onChange={(event) => setPaymentDraft((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <button className="btn primary" type="button" onClick={addPayment} disabled={paymentSaving}>
            {p.addPayment}
          </button>
        </div>

        <h4>{p.history}</h4>
        <div className="invoice-payment-history">
          {(invoice.payments || []).map((payment) => (
            <div key={payment.id} className="invoice-payment-row">
              <div>
                <strong>{p.types[payment.type] || payment.type}</strong>
                <span>{p.statuses[payment.status] || payment.status}</span>
              </div>
              <div>
                <strong>{formatMoney(payment.amount, payment.currency || 'EUR')}</strong>
                <span>{payment.paidDate?.substring(0, 10) || payment.dueDate?.substring(0, 10) || '-'}</span>
              </div>
              <div>
                <span>{payment.method || '-'}</span>
                <span>{payment.reference || '-'}</span>
              </div>
              <button className="btn danger" type="button" onClick={() => deletePayment(payment.id)} disabled={paymentSaving}>
                {p.remove}
              </button>
            </div>
          ))}
          {(invoice.payments || []).length === 0 && <div className="muted">{p.noPayments}</div>}
        </div>
      </section>

      <div className="spacer" />
      <hr />

      <h3>{m.invoiceDetailPage.positions}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>{m.common.date}</th>
            <th>{m.common.description}</th>
            <th>{m.common.employee}</th>
            <th>{m.common.order}</th>
            <th>{m.common.site}</th>
            <th style={{ textAlign: 'right' }}>{m.common.hours}</th>
            <th style={{ textAlign: 'right' }}>{m.common.rate}</th>
            <th style={{ textAlign: 'right' }}>{m.common.amount}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.serviceDate?.substring(0, 10)}</td>
              <td>{line.description || m.common.none}</td>
              <td>{line.workEntry?.employee ? `${line.workEntry.employee.firstName} ${line.workEntry.employee.lastName}` : m.common.none}</td>
              <td>{line.workEntry?.order?.title || m.common.none}</td>
              <td>{line.workEntry?.site?.siteName || m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{Number(line.hoursAllocated).toFixed(2)}</td>
              <td style={{ textAlign: 'right' }}>{line.unitRate ? `${Number(line.unitRate).toFixed(2)} EUR` : m.common.none}</td>
              <td style={{ textAlign: 'right' }}>{line.lineAmount ? `${Number(line.lineAmount).toFixed(2)} EUR` : m.common.none}</td>
            </tr>
          ))}
          {invoice.lines.length === 0 && (
            <tr><td colSpan={8} className="muted">{m.invoiceDetailPage.noLines}</td></tr>
          )}
        </tbody>
      </table>

      <div className="spacer" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div><b>{m.invoiceDetailPage.totalHours}:</b> {Number(invoice.totalHours ?? 0).toFixed(2)}</div>
        <div><b>{m.invoiceDetailPage.totalAmount}:</b> {totalAmount.toFixed(2)} EUR</div>
      </div>

      <div className="spacer" />
      <div className="muted">{m.invoiceDetailPage.deleteHint}</div>
    </div>
  );
}
