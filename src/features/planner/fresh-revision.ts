"use client";

import { getWeekRevisionAction } from "@/app/plan/actions";

export type FreshRevision =
  | { ok: true; revision: number }
  | { ok: false; unauthenticated: boolean; message: string };

// Copy/template sheets always apply against a just-read revision, so the
// visible week's revision prop can never go stale underneath them.
export async function resolveFreshRevision(
  monday: string,
): Promise<FreshRevision> {
  const rev = await getWeekRevisionAction({ monday });
  if (!rev.ok) {
    return {
      ok: false,
      unauthenticated: rev.code === "UNAUTHENTICATED",
      message: rev.message,
    };
  }
  if (rev.revision === undefined) {
    return { ok: false, unauthenticated: false, message: "โหลดข้อมูลไม่สำเร็จ" };
  }
  return { ok: true, revision: rev.revision };
}
