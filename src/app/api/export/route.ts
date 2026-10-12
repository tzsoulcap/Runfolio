import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import { exportUserData } from "@/lib/services/export";

// Session + ownership checked server-side (§13): the export only ever
// contains the signed-in user's own rows.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const data = await exportUserData(userId);
  const stamp = new Date().toISOString().slice(0, 10);
  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="runfolio-export-${stamp}.json"`,
    },
  });
}
