// Value may be the publishable (sb_…) or legacy anon (eyJ…) key;
// the client accepts both.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env missing: copy .env.example to .env.local");
  }
  return { url, anonKey };
}
