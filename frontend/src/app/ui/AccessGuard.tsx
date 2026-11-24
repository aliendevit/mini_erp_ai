'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { accessDecisionForPath, readStoredAccessUser } from '../../lib/access';

const PUBLIC_PREFIXES = ['/auth', '/register', '/registration', '/access-denied'];

function isPublicPath(pathname: string) {
  return pathname === '/viewer-dashboard' || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);
  const [redirecting, setRedirecting] = useState(false);

  const decision = useMemo(() => {
    if (isPublicPath(pathname)) return { allowed: true, reason: '', rule: null };
    return accessDecisionForPath(pathname, readStoredAccessUser());
  }, [pathname, authVersion]);

  useEffect(() => {
    function markReady() {
      setAuthVersion((current) => current + 1);
    }
    setReady(true);
    window.addEventListener('storage', markReady);
    window.addEventListener('omran-auth-changed', markReady);
    return () => {
      window.removeEventListener('storage', markReady);
      window.removeEventListener('omran-auth-changed', markReady);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (decision.allowed || isPublicPath(pathname)) {
      setRedirecting(false);
      return;
    }
    if (!readStoredAccessUser()) {
      setRedirecting(true);
      router.replace('/auth');
      return;
    }
    const params = new URLSearchParams({
      feature: decision.rule?.title || 'Protected page',
      reason: decision.reason || 'You do not have access to this page.',
      from: pathname,
    });
    setRedirecting(true);
    router.replace(`/access-denied?${params.toString()}`);
  }, [decision.allowed, decision.reason, decision.rule?.title, pathname, ready, router]);

  if (!ready || redirecting) {
    return <div className="access-guard-placeholder" aria-live="polite">Checking access...</div>;
  }

  return <>{children}</>;
}
