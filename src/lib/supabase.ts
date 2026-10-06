import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY harus diset di .env.local"
  );
}

// Wilayah administrative codes/names change extremely rarely, so every
// Supabase REST call made through this client is cached by Next.js's fetch
// cache for a day instead of hitting Supabase on every request. This is the
// main lever for staying inside Supabase's free-tier quota as traffic grows.
const SUPABASE_CACHE_SECONDS = 60 * 60 * 24;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, next: { revalidate: SUPABASE_CACHE_SECONDS } }),
  },
});
