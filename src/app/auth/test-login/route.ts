import { NextResponse, type NextRequest } from "next/server";

import { ensureUserProfile } from "@/lib/services/profile";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// E2E test backdoor (the T14-authorized auth choice: backdoor over real
// Google UI). Unreachable in production: 404 unless the build is NOT
// production AND the secret matches. NEVER set E2E_TEST_SECRET on Vercel.
//
// Session minting uses an admin magiclink + OTP verify, which works while
// email/password logins stay disabled — the product remains Google-only.
export async function GET(request: NextRequest) {
  const secret = process.env.E2E_TEST_SECRET;
  const given = request.nextUrl.searchParams.get("secret");
  if (process.env.NODE_ENV === "production" || !secret || given !== secret) {
    return new NextResponse("not found", { status: 404 });
  }
  // Parallel workers each get their own user: a fresh magiclink would
  // invalidate a sibling worker's OTP, and data stays isolated per user.
  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!/^e2e-loop(-[a-z0-9-]+)?@example\.com$/.test(email)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data: link, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link?.properties?.email_otp;
  if (linkError || !otp) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (error || !data.user) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  await ensureUserProfile(data.user.id);
  return NextResponse.json({ ok: true, userId: data.user.id });
}
