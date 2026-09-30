import type { ReactNode } from 'react';
import { AdminShell } from '../../components/layout/AdminShell';

export default function PosLayout({ children }: { children: ReactNode }) {
  return <AdminShell compact>{children}</AdminShell>;
}
