'use client';

import Link from 'next/link';

interface AuthHeaderProps {
  onOpenAuth?: () => void;
  label?: string;
}

export function AuthHeader({ onOpenAuth, label = 'Sign In / Up' }: AuthHeaderProps) {
  return (
    <header className="auth-header">
      <div className="auth-header-inner">
        <div>
          <p className="auth-eyebrow">Welcome to Omran</p>
          <h1 className="auth-title">Secure access for your team</h1>
        </div>

        {onOpenAuth ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="btn primary"
          >
            {label}
          </button>
        ) : (
          <Link
            href="/auth"
            className="btn"
          >
            {label}
          </Link>
        )}
      </div>
    </header>
  );
}
