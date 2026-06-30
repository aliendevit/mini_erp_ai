'use client';

import { useEffect } from 'react';

export default function CompanyDashboardRedirectPage() {
  useEffect(() => {
    window.location.replace('/');
  }, []);

  return null;
}
