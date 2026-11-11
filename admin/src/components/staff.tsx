'use client';

import { createContext, useContext } from 'react';

export interface Staff {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  verified: boolean;
  totpEnabled: boolean;
}

export const StaffCtx = createContext<Staff | null>(null);
export const useStaff = () => useContext(StaffCtx)!;
export const useCan = () => {
  const staff = useContext(StaffCtx);
  return (permission: string) => Boolean(staff?.permissions.includes(permission));
};
