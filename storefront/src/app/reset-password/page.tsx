import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Set a new password', robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
