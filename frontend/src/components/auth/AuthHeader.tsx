'use client';

import Link from 'next/link';

interface AuthHeaderProps {
  onOpenAuth?: () => void;
  label?: string;
}

export function AuthHeader({ onOpenAuth, label = 'Sign In / Up' }: AuthHeaderProps) {
  return (
    <header className=" w-3/4 m-2 rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Welcome to Omran</p>
          <h1 className=" block m-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Secure access for your team</h1>
        </div>

        {onOpenAuth ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
          >
            {label}
          </button>
        ) : (
          <Link
            href="/auth"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          >
            {label}
          </Link>
        )}
      </div>
    </header>
  );
}
