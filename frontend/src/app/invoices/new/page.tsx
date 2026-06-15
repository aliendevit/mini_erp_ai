'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiGet, apiJson } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useToast } from '../../ui/ToastProvider';

type Customer = { id: string; companyName: string };
type WorkshopAssignment = {
  workshop?: { name?: string | null } | null;
  workshopName?: string | null;
  coveredSkills?: string[];
};
type Site = {
  id: string;
  siteName: string;
  notes?: string | null;
  workshopAssignments?: WorkshopAssignment[];
};
type OrderSummary = {
  id: string;
  title: string;
  customer?: Customer | null;
  currency?: string | null;
};
type OrderDetail = OrderSummary & { sites?: Site[] };

type InvoiceItemDraft = {
  siteId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  workshopName: string;
  notes: string;
};

function emptyItem(): InvoiceItemDraft {
  return { siteId: '', description: '', quantity: '1', unitPrice: '', totalAmount: '', workshopName: '', notes: '' };
}

function firstWorkshopName(site?: Site): string {
  const assignment = site?.workshopAssignments?.[0];
  return assignment?.workshop?.name || assignment?.workshopName || '';
}

export default function NewWorkshopInvoicePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [status, setStatus] = useState<'draft' | 'final' | 'sent' | 'paid'>('final');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItemDraft[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const t = locale === 'ar'
    ? {
        kicker: 'فواتير الورش',
        title: 'إنشاء فاتورة ورشة',
        description: 'أنشئ فاتورة ثابتة من مواقع الطلب وحزم عمل الورش بدون سجلات ساعات الموظفين.',
        items: 'البنود', total: 'الإجمالي', status: 'الحالة',
        fixedInvoice: 'فاتورة ورشة ثابتة',
        fixedDescription: 'اختر الطلب، راجع بنود المواقع، أدخل الأسعار الثابتة، ثم أنشئ الفاتورة.',
        back: 'العودة إلى الفواتير', order: 'الطلب', selectOrder: 'اختر الطلب',
        draft: 'مسودة', final: 'نهائية', sent: 'مرسلة', paid: 'مدفوعة', issueDate: 'تاريخ الإصدار',
        notes: 'ملاحظات الفاتورة', notesPlaceholder: 'ملاحظات عامة للفاتورة',
        siteItems: 'بنود المواقع والورش', addItem: 'إضافة بند', item: 'البند', remove: 'حذف',
        site: 'الموقع', generalItem: 'بند عام للطلب', workshop: 'الورشة', workshopPlaceholder: 'اسم الورشة',
        quantity: 'الكمية', unitPrice: 'سعر الوحدة', totalOverride: 'إجمالي بديل', optional: 'اختياري',
        itemDescription: 'الوصف', itemNotes: 'ملاحظات البند', itemNotesPlaceholder: 'ملاحظات اختيارية للبند',
        storedNote: 'يتم حفظ الفاتورة كفاتورة ورشة ثابتة، ويتم حفظ تفصيل البنود ضمن الملاحظات.',
        creating: 'جاري الإنشاء...', create: 'إنشاء الفاتورة', chooseOrder: 'اختر طلباً أولاً.', itemRequired: 'أضف بنداً واحداً على الأقل مع وصف.'
      }
    : locale === 'de'
      ? {
        kicker: 'Werkstattabrechnung', title: 'Werkstattrechnung erstellen', description: 'Eine Pauschalrechnung aus Auftragsstandorten und Werkstatt-Leistungspaketen ohne Mitarbeiterzeiten erstellen.',
        items: 'Positionen', total: 'Summe', status: 'Status', fixedInvoice: 'Pauschale Werkstattrechnung', fixedDescription: 'Auftrag ausw?hlen, Standortpositionen pr?fen, Festpreise eintragen und Rechnung erstellen.',
        back: 'Zur?ck zu Rechnungen', order: 'Auftrag', selectOrder: 'Auftrag ausw?hlen', draft: 'Entwurf', final: 'Final', sent: 'Gesendet', paid: 'Bezahlt', issueDate: 'Ausstellungsdatum',
        notes: 'Rechnungsnotizen', notesPlaceholder: 'Allgemeine Rechnungsnotizen', siteItems: 'Standort- / Werkstattpositionen', addItem: 'Position hinzuf?gen', item: 'Position', remove: 'Entfernen',
        site: 'Standort', generalItem: 'Allgemeine Auftragsposition', workshop: 'Werkstatt', workshopPlaceholder: 'Werkstattname', quantity: 'Menge', unitPrice: 'Einzelpreis', totalOverride: 'Gesamtbetrag ?berschreiben', optional: 'Optional',
        itemDescription: 'Beschreibung', itemNotes: 'Positionsnotizen', itemNotesPlaceholder: 'Optionale Positionsnotizen', storedNote: 'Die Rechnung wird als pauschale Werkstattrechnung gespeichert. Die Positionsdetails werden in den Notizen gespeichert.',
        creating: 'Wird erstellt...', create: 'Rechnung erstellen', chooseOrder: 'Zuerst einen Auftrag ausw?hlen.', itemRequired: 'Mindestens eine Position mit Beschreibung hinzuf?gen.'
      }
      : {
        kicker: 'Workshop Billing', title: 'Create workshop invoice', description: 'Create a fixed invoice from order sites and workshop work packages without employee work entries.',
        items: 'Items', total: 'Total', status: 'Status', fixedInvoice: 'Fixed workshop invoice', fixedDescription: 'Select an order, review site items, enter fixed prices, then create the invoice.',
        back: 'Back to invoices', order: 'Order', selectOrder: 'Select order', draft: 'Draft', final: 'Final', sent: 'Sent', paid: 'Paid', issueDate: 'Issue date',
        notes: 'Invoice notes', notesPlaceholder: 'General invoice notes', siteItems: 'Site / workshop items', addItem: 'Add item', item: 'Item', remove: 'Remove',
        site: 'Site', generalItem: 'General order item', workshop: 'Workshop', workshopPlaceholder: 'Workshop name', quantity: 'Quantity', unitPrice: 'Unit price', totalOverride: 'Total override', optional: 'Optional',
        itemDescription: 'Description', itemNotes: 'Item notes', itemNotesPlaceholder: 'Optional item notes', storedNote: 'The invoice is stored as a fixed workshop invoice. Item breakdown is saved in notes.',
        creating: 'Creating...', create: 'Create invoice', chooseOrder: 'Choose an order first.', itemRequired: 'Add at least one invoice item with a description.'
      };

  useEffect(() => {
    apiGet<OrderSummary[]>('/orders').then(setOrders).catch((error) => alert(error.message));
  }, []);

  useEffect(() => {
    setIssueDate(new Date().toISOString().slice(0, 10));
    try {
      const orderId = new URLSearchParams(window.location.search).get('orderId');
      if (orderId) setSelectedOrderId(orderId);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrder(null);
      setItems([emptyItem()]);
      return;
    }
    apiGet<OrderDetail>(`/orders/${selectedOrderId}`)
      .then((data) => {
        setOrder(data);
        const siteItems = (data.sites || []).map((site) => ({
          siteId: site.id,
          description: site.notes || site.siteName || '',
          quantity: '1',
          unitPrice: '',
          totalAmount: '',
          workshopName: firstWorkshopName(site),
          notes: '',
        }));
        setItems(siteItems.length ? siteItems : [emptyItem()]);
      })
      .catch((error) => alert(error.message));
  }, [selectedOrderId]);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const direct = Number(item.totalAmount);
      if (Number.isFinite(direct) && item.totalAmount.trim() !== '') return sum + direct;
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);
      return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0);
    }, 0);
  }, [items]);

  function updateItem(index: number, patch: Partial<InvoiceItemDraft>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit() {
    if (!selectedOrderId) return alert(t.chooseOrder);
    const cleanItems = items
      .map((item) => ({
        siteId: item.siteId || null,
        description: item.description.trim(),
        quantity: Number(item.quantity || 1),
        unitPrice: item.unitPrice.trim() === '' ? null : Number(item.unitPrice),
        totalAmount: item.totalAmount.trim() === '' ? null : Number(item.totalAmount),
        workshopName: item.workshopName.trim() || null,
        notes: item.notes.trim() || null,
      }))
      .filter((item) => item.description);
    if (!cleanItems.length) return alert(t.itemRequired);

    setSaving(true);
    try {
      const response = await apiJson<{ invoice: { id: string } }>('/invoices/workshop-fixed', 'POST', {
        orderId: selectedOrderId,
        status,
        issueDate: issueDate || null,
        notes: notes || null,
        items: cleanItems,
      });
      showToast(locale === 'de' ? 'Rechnung wurde erstellt.' : locale === 'ar' ? 'تم إنشاء الفاتورة.' : 'Invoice created.', 'success');
      router.push(`/invoices/${response.invoice.id}`);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="entity-page invoices-page">
      <section className="entity-hero card">
        <div className="entity-hero-copy">
          <div className="entity-kicker">{t.kicker}</div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
        </div>
        <div className="entity-hero-stats">
          <div className="entity-stat"><strong>{items.length}</strong><span>{t.items}</span></div>
          <div className="entity-stat"><strong>{total.toFixed(2)}</strong><span>{t.total}</span></div>
          <div className="entity-stat"><strong>{status}</strong><span>{t.status}</span></div>
        </div>
      </section>

      <div className="card entity-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2>{t.fixedInvoice}</h2>
            <p className="muted">{t.fixedDescription}</p>
          </div>
          <Link className="btn" href="/invoices">{t.back}</Link>
        </div>

        <div className="spacer" />
        <div className="row">
          <div>
            <label>{t.order}</label>
            <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
              <option value="">{t.selectOrder}</option>
              {orders.map((item) => (
                <option key={item.id} value={item.id}>{item.title} - {item.customer?.companyName || 'No customer'}</option>
              ))}
            </select>
          </div>
          <div>
            <label>{t.status}</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="draft">{t.draft}</option>
              <option value="final">{t.final}</option>
              <option value="sent">{t.sent}</option>
              <option value="paid">{t.paid}</option>
            </select>
          </div>
          <div>
            <label>{t.issueDate}</label>
            <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </div>
        </div>

        <div className="spacer" />
        <label>{t.notes}</label>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t.notesPlaceholder} />

        <div className="spacer" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3>{t.siteItems}</h3>
          <button className="btn" type="button" onClick={addItem}>+ {t.addItem}</button>
        </div>

        <div className="spacer" />
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map((item, index) => {
            const selectedSite = order?.sites?.find((site) => site.id === item.siteId);
            return (
              <div key={index} className="card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h3>{t.item} {index + 1}</h3>
                  {items.length > 1 && <button className="btn danger" type="button" onClick={() => removeItem(index)}>{t.remove}</button>}
                </div>
                <div className="row">
                  <div>
                    <label>{t.site}</label>
                    <select
                      value={item.siteId}
                      onChange={(event) => {
                        const site = order?.sites?.find((candidate) => candidate.id === event.target.value);
                        updateItem(index, {
                          siteId: event.target.value,
                          description: item.description || site?.notes || site?.siteName || '',
                          workshopName: item.workshopName || firstWorkshopName(site),
                        });
                      }}
                    >
                      <option value="">{t.generalItem}</option>
                      {(order?.sites || []).map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>{t.workshop}</label>
                    <input value={item.workshopName} onChange={(event) => updateItem(index, { workshopName: event.target.value })} placeholder={t.workshopPlaceholder} />
                  </div>
                  <div>
                    <label>{t.quantity}</label>
                    <input type="number" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                  </div>
                  <div>
                    <label>{t.unitPrice}</label>
                    <input type="number" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: event.target.value })} />
                  </div>
                  <div>
                    <label>{t.totalOverride}</label>
                    <input type="number" step="0.01" value={item.totalAmount} onChange={(event) => updateItem(index, { totalAmount: event.target.value })} placeholder={t.optional} />
                  </div>
                </div>
                <div className="spacer" />
                <label>{t.itemDescription}</label>
                <textarea value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder={selectedSite?.siteName || 'Work package description'} />
                <div className="spacer" />
                <label>{t.itemNotes}</label>
                <textarea value={item.notes} onChange={(event) => updateItem(index, { notes: event.target.value })} placeholder={t.itemNotesPlaceholder} />
              </div>
            );
          })}
        </div>

        <div className="spacer" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <b>{t.total}:</b> {total.toFixed(2)} {order?.currency || 'EUR'}
            <div className="muted">{t.storedNote}</div>
          </div>
          <button className="btn primary" type="button" onClick={submit} disabled={saving || !selectedOrderId}>
            {saving ? t.creating : t.create}
          </button>
        </div>
      </div>
    </div>
  );
}
