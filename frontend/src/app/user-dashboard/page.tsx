'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { dashboardPathForUser, hasPermission, readStoredAccessUser, type StoredAccessUser } from '../../lib/access';

export default function UserDashboardPage() {
  const [user, setUser] = useState<StoredAccessUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nextUser = readStoredAccessUser();
    setUser(nextUser);
    setReady(true);
    if (!nextUser) window.location.href = '/auth';
    else if (nextUser.accountLevel !== 'company_user') window.location.href = dashboardPathForUser(nextUser);
  }, []);

  if (!ready || !user || user.accountLevel !== 'company_user') return null;

  const tools = [
    { title: 'AI Intake', desc: 'Create project requests and capture details.', permission: 'use_ai_intake', href: '/ai-intake' },
    { title: 'RAG Memory', desc: 'Use approved project memory and uploaded notes.', permission: 'use_rag', href: '/ai-intake' },
    { title: 'Project Tracking', desc: 'Update progress, issues, materials, and photos.', permission: 'update_tracking', href: '/orders' },
    { title: 'Invoices', desc: 'Restricted unless manager enables invoice access.', permission: 'manage_invoices', href: '/invoices' },
  ];

  return (
    <main className="saas-page">
      <section className="saas-hero">
        <div>
          <span>Level 3 - Company User</span>
          <h1>Work inside the company with only the tools your manager enables.</h1>
          <p>This account is limited to selected AI and project features, so sensitive billing, backup, and company settings stay protected.</p>
        </div>
        <div className="saas-login-card">
          <strong>{user.email}</strong>
          <span>{user.role}</span>
          <small>{user.tenantName}</small>
        </div>
      </section>

      <section className="saas-metric-grid">
        <div><strong>{user.permissions?.length || 0}</strong><span>Enabled permissions</span></div>
        <div><strong>AI</strong><span>Selected tools only</span></div>
        <div><strong>No</strong><span>Platform access</span></div>
        <div><strong>No</strong><span>Restore backups</span></div>
      </section>

      <section className="saas-grid">
        {tools.map((tool) => {
          const enabled = hasPermission(user, tool.permission);
          return (
            <article key={tool.permission} className={`saas-card ${enabled ? '' : 'disabled'}`}>
              <span>{enabled ? 'Enabled' : 'Disabled'}</span>
              <h2>{tool.title}</h2>
              <p>{tool.desc}</p>
              {enabled ? <Link className="btn" href={tool.href}>Open</Link> : <button className="btn" disabled>Ask manager</button>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
