import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, githubRedirectUrl } from '../lib/supabase';
import { AuthContext } from '../lib/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    void (async () => {
      const url = new URL(window.location.href);
      const callback = url.searchParams.has('auth_callback');
      try {
        if (callback) {
          const code = url.searchParams.get('code');
          if (!code || url.searchParams.has('error')) throw new Error('OAuth callback failed');
          const { data, error: cause } = await client.auth.exchangeCodeForSession(code);
          if (cause) throw cause;
          if (active) setUser(data.user);
        } else {
          const { data, error: cause } = await client.auth.getSession();
          if (cause) throw cause;
          if (active) setUser(data.session?.user ?? null);
        }
      } catch {
        if (active) setError('Could not finish GitHub sign-in. Please try again in the same browser.');
      } finally {
        if (callback) {
          // Remove single-use codes/errors from history, and never accept a return URL from the callback.
          for (const name of ['auth_callback', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(name);
          url.hash = '/training';
          window.history.replaceState(null, '', url);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  async function signIn() {
    if (!client) return;
    setError('');
    try {
      const { error: cause } = await client.auth.signInWithOAuth({
        provider: 'github', options: { redirectTo: githubRedirectUrl(), scopes: 'read:user' },
      });
      if (cause) throw cause;
    } catch { setError('GitHub sign-in could not start. Please try again.'); }
  }
  async function signOut() {
    if (!client) return;
    setError('');
    try {
      const { error: cause } = await client.auth.signOut({ scope: 'local' });
      if (cause) throw cause;
      setUser(null);
    } catch { setError('Could not sign out. Please try again.'); }
  }
  return <AuthContext.Provider value={{ user, loading, configured: Boolean(client), error, signIn, signOut }}>
    {/* Account switches dispose cameras, captures and private data in all child screens. */}
    <Fragment key={user?.id ?? 'guest'}>{children}</Fragment>
  </AuthContext.Provider>;
}
