import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { userProfiles, type UserProfile } from "@/lib/db/schema";

export async function ensureUserProfile(userId: string): Promise<UserProfile> {
  await db
    .insert(userProfiles)
    .values({ userId })
    .onConflictDoNothing({ target: userProfiles.userId });
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new Error("profile missing after ensure");
  }
  return profile;
}

export async function getOwnProfile(
  userId: string,
): Promise<UserProfile | null> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}
