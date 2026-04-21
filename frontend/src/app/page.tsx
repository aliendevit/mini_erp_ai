'use client';

import Link from 'next/link';

import { useI18n } from '../lib/i18n';
import { InvoiceSequenceSetting } from './ui/InvoiceSequenceSetting';

export default function Page() {
  const { messages } = useI18n();

  return (
    <>
      <InvoiceSequenceSetting />
      <div className="grid">
        {messages.dashboard.cards.map((card) => (
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
