import Link from 'next/link';
import { InvoiceSequenceSetting } from './ui/InvoiceSequenceSetting';

export default function Page() {
  const cards = [
    { href: '/customers', title: 'Kunden', desc: 'Auftraggeber verwalten' },
    { href: '/orders', title: 'Aufträge', desc: 'Aufträge erstellen und anzeigen' },
    { href: '/sites', title: 'Baustellen', desc: 'Baustellen verwalten' },
    { href: '/employees', title: 'Mitarbeiter', desc: 'Mitarbeiter verwalten' },
    { href: '/work-entries', title: 'Arbeitszeiten', desc: 'Stunden erfassen (erzeugt Entwurf-Rechnung)' },
    { href: '/invoices/drafts', title: 'Entwurf-Rechnungen', desc: 'Gruppieren und zusammenführen' },
    { href: '/invoices', title: 'Rechnungen', desc: 'Alle Rechnungen + PDF' },
    { href: '/reports/hours', title: 'Stundenübersicht', desc: 'Aggregation nach Mitarbeiter/Baustelle/Auftrag' }
  ];

  return (
    <>
      <InvoiceSequenceSetting />
      <div className="grid">
        {cards.map((c) => (
          <div key={c.href} className="card">
            <h2><Link href={c.href}>{c.title}</Link></h2>
            <div className="muted">{c.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
