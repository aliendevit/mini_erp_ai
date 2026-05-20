'use client';

import { useParams } from 'next/navigation';

import ProjectTrackingSection from '../ProjectTrackingSection';

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  if (!id) return null;
  return <ProjectTrackingSection orderId={id} />;
}
