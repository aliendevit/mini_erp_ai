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
    { title: 'Project Tracking', desc: 'Update progress, issues, materials, and photos.', permission: 'update_tracking', href: '/orders' },
    { title: 'Invoices', desc: 'Restricted unless manager enables invoice access.', permission: 'manage_invoices', href: '/invoices' },
  ];

  return (
    <main className="dashboard-shell user-dashboard-shell">
      <section className="dashboard-hero card user-dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="eyebrow">Company Workspace</div>
          <h1>Your enabled tools in {user.tenantName || 'the company'}.</h1>
          <p>This dashboard shows only the work areas your manager enabled for your account, keeping company settings, billing controls, backups, and platform administration protected.</p>
          <div className="dashboard-hero-actions">
            {hasPermission(user, 'use_ai_intake') ? <Link className="btn primary" href="/ai-intake">Open AI Intake</Link> : null}
            {hasPermission(user, 'view_projects') || hasPermission(user, 'update_tracking') ? <Link className="btn" href="/orders">Open Projects</Link> : null}
          </div>
        </div>
        <div className="dashboard-stats user-dashboard-profile">
          <div>
            <strong>{user.email}</strong>
            <span>{user.role || 'Company user'}</span>
          </div>
          <div>
            <strong>{user.permissions?.length || 0}</strong>
            <span>Enabled permissions</span>
          </div>
          <div>
            <strong>No</strong>
            <span>Platform access</span>
          </div>
        </div>
      </section>

      <section className="dashboard-section-header">
        <div>
          <h2>Available Work Areas</h2>
          <div className="muted">Manager-controlled tools for daily operations</div>
        </div>
      </section>

      <section className="dashboard-workflow-grid user-dashboard-tool-grid">
        {tools.map((tool) => {
          const enabled = hasPermission(user, tool.permission);
          return (
            <article key={tool.permission} className={`dashboard-workflow-card card user-dashboard-tool-card ${enabled ? '' : 'disabled'}`}>
              <span>{enabled ? 'ON' : 'OFF'}</span>
              <strong>{tool.title}</strong>
              <small>{tool.desc}</small>
              {enabled ? <Link className="btn" href={tool.href}>Open</Link> : <button className="btn" disabled>Ask manager</button>}
            </article>
          );
        })}
      </section>

      <section className="dashboard-section-header">
        <div>
          <h2>Account Boundaries</h2>
          <div className="muted">What this normal user account cannot change</div>
        </div>
      </section>

      <section className="dashboard-module-grid user-dashboard-boundary-grid">
        {[
          ['Company settings', 'Only managers can edit company profile, users, and invoice settings.'],
          ['Backups and restore', 'Backup creation and restore stay outside normal user access.'],
          ['Platform billing', 'OMRAN SaaS billing is only visible to the platform admin.'],
        ].map(([title, desc]) => (
          <div key={title} className="dashboard-module-card card">
            <span>LOCK</span>
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
            <b>Protected</b>
          </div>
        ))}
      </section>
    </main>
  );
}
