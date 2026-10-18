import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type Auth = { user: User | null; loading: boolean; configured: boolean; error: string; signIn(): Promise<void>; signOut(): Promise<void> };
export const AuthContext = createContext<Auth | null>(null);
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is missing.');
  return auth;
}
