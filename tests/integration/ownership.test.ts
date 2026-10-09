import net from "node:net";

import { afterEach, describe, expect, it } from "vitest";

function tcpOk(host: string, port: number, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.setTimeout(ms);
  });
}

async function dbReachable(): Promise<boolean> {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const { hostname, port } = new URL(raw);
    return await tcpOk(hostname, Number(port) || 5432);
  } catch {
    return false;
  }
}

// Skips (loudly) only when Postgres is unreachable, e.g. sandboxed CI.
// A skip is NOT a pass: run with DB access for a real result.
const canRun = await dbReachable();
if (!canRun) {
  console.warn(
    "SKIP integration/ownership: Postgres unreachable — NOT verified, run locally.",
  );
}

describe.skipIf(!canRun)("profile ownership", () => {
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
