import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Confirmation } from './Confirmation';

export const metadata: Metadata = { title: 'Order confirmation', robots: { index: false } };

export default async function ConfirmationPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return (
    <Suspense>
      <Confirmation orderNumber={orderNumber} />
    </Suspense>
  );
}
