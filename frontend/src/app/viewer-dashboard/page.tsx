'use client';

import Link from 'next/link';

export default function ViewerDashboardPage() {
  return (
    <main className="saas-page viewer-dashboard-page">
      <section className="saas-hero">
        <div>
          <span>Guest Viewer Mode</span>
          <h1>Explore OMRAN without registration.</h1>
          <p>This public viewer mode shows a limited product preview. Guest viewers cannot create, edit, delete, upload, restore, use private AI data, or open real company records.</p>
        </div>
        <div className="saas-login-card">
          <strong>Guest access</strong>
          <span>Read-only preview</span>
          <small>No account required</small>
        </div>
      </section>

      <section className="saas-metric-grid">
        <div><strong>Preview</strong><span>Product overview</span></div>
        <div><strong>No</strong><span>Invoice access</span></div>
        <div><strong>No</strong><span>AI changes</span></div>
        <div><strong>No</strong><span>Company data access</span></div>
      </section>

      <section className="saas-grid">
        <article className="saas-card">
          <span>Projects</span>
          <h2>Project workflow preview</h2>
          <p>See how OMRAN organizes customers, orders, sites, workshops, progress, and handover work in one connected system.</p>
        </article>
        <article className="saas-card">
          <span>AI</span>
          <h2>AI feature preview</h2>
          <p>Review the available AI areas: intake, RAG knowledge, monitoring, and structured proposal support.</p>
        </article>
        <article className="saas-card disabled">
          <span>Restricted</span>
          <h2>No operational changes</h2>
          <p>Guest viewer mode cannot access private company records. Sign in with an approved company account to work with real data.</p>
          <Link className="btn primary" href="/auth">Sign in</Link>
        </article>
      </section>
    </main>
  );
}
