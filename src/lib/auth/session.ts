import { cache } from "react";

import { resolveAccountName } from "@/lib/auth/account";
import { ServiceError } from "@/lib/services/errors";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims.sub !== "string") {
    return null;
  }
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    displayName: resolveAccountName(null, data.claims.user_metadata),
  };
});

export async function getSessionUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new ServiceError("UNAUTHENTICATED", "sign in required");
  }
  return userId;
}
