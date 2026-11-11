import type { Metadata } from 'next';
import { AccountShell } from './AccountShell';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
