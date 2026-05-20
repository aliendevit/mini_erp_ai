'use client';

import { useParams } from 'next/navigation';

import ProjectMonitoringSection from '../ProjectMonitoringSection';

export default function OrderMonitoringPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  if (!id) return null;
  return <ProjectMonitoringSection orderId={id} />;
}
