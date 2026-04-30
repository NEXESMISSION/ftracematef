import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example → .env.local and fill them in.'
  );
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // CRITICAL: leave detectSessionInUrl OFF. With it on, Supabase auto-
    // consumes a `?code=…` on whatever page mounts first — including
    // Home.jsx if the OAuth provider lands on `/` due to a redirect-URL
    // mismatch — and then our <Navigate to="/auth/callback"> strips the
    // code from the URL before AuthCallback ever sees it. AuthCallback
    // would then time out with "we couldn't complete sign-in" even though
    // the session was actually created. Instead we call
    // `exchangeCodeForSession` explicitly inside AuthCallback, which is
    // the only page allowed to perform the exchange.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
