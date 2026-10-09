import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

// Server-only admin client (service role). Never import from Client Components.
export function getAdminClient(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env is not set");
  }
  admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}
