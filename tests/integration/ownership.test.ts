import { afterEach, describe, expect, it } from "vitest";

import { canRunDb } from "./db-gate";

describe.skipIf(!canRunDb)("profile ownership", () => {
  const created: string[] = [];
  afterEach(async () => {
    if (created.length === 0) return;
    const { db } = await import("@/lib/db/client");
    const { userProfiles } = await import("@/lib/db/schema");
    const { inArray } = await import("drizzle-orm");
    await db.delete(userProfiles).where(inArray(userProfiles.userId, created));
    created.length = 0;
  });

  it("users only read their own profile", async () => {
    const { ensureUserProfile, getOwnProfile } = await import(
      "@/lib/services/profile"
    );
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    created.push(a, b);
    await ensureUserProfile(a);
    await ensureUserProfile(b);
    expect((await getOwnProfile(a))?.userId).toBe(a);
    expect((await getOwnProfile(b))?.userId).toBe(b);
  });

  it("ensure is idempotent with Bangkok defaults", async () => {
    const { ensureUserProfile } = await import("@/lib/services/profile");
    const id = crypto.randomUUID();
    created.push(id);
    const first = await ensureUserProfile(id);
    const second = await ensureUserProfile(id);
    expect(second.userId).toBe(id);
    expect(first.timezone).toBe("Asia/Bangkok");
    expect(first.locale).toBe("th-TH");
  });
});
