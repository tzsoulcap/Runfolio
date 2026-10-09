import { ServiceError } from "@/lib/services/errors";
import { createClient } from "@/lib/supabase/server";

export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims.sub !== "string") {
    return null;
  }
  return data.claims.sub;
}

export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new ServiceError("UNAUTHENTICATED", "sign in required");
  }
  return userId;
}
