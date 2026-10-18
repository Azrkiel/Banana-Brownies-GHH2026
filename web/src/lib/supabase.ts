import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

/** Only public project settings belong in the browser. RLS protects every row. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return client = null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return client = null;
    // Fail closed if someone accidentally supplies a privileged legacy key.
    if (key.startsWith('sb_secret_')) return client = null;
    if (!key.startsWith('sb_publishable_')) {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon') return client = null;
    }
    client = createClient(url, key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
    return client;
  } catch { return client = null; }
}

export function githubRedirectUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}?auth_callback=github`, window.location.origin).href;
}
