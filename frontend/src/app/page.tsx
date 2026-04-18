import Link from 'next/link';
import { InvoiceSequenceSetting } from './ui/InvoiceSequenceSetting';

export default function Page() {
  const cards = [
    { href: '/customers', title: 'Kunden', desc: 'Auftraggeber verwalten' },
    { href: '/orders', title: 'Auftraege', desc: 'Auftraege erstellen und anzeigen' },
    { href: '/sites', title: 'Baustellen', desc: 'Baustellen verwalten' },
    { href: '/employees', title: 'Mitarbeiter', desc: 'Mitarbeiter verwalten' },
    { href: '/work-entries', title: 'Arbeitszeiten', desc: 'Stunden erfassen (erzeugt Entwurf-Rechnung)' },
    { href: '/invoices/drafts', title: 'Entwurf-Rechnungen', desc: 'Gruppieren und zusammenfuehren' },
    { href: '/invoices', title: 'Rechnungen', desc: 'Alle Rechnungen + PDF' },
    { href: '/reports/hours', title: 'Stundenuebersicht', desc: 'Aggregation nach Mitarbeiter/Baustelle/Auftrag' },
    { href: '/ai-intake', title: 'AI Intake', desc: 'Chatbasierten Vorschlag erzeugen und Team empfehlen lassen' },
  ];

  return (
    <>
      <InvoiceSequenceSetting />
      <div className="grid">
        {cards.map((card) => (
          <div key={card.href} className="card">
            <h2>
              <Link href={card.href}>{card.title}</Link>
            </h2>
            <div className="muted">{card.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
