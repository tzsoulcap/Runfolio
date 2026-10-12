import { NextResponse, type NextRequest } from "next/server";

import { ensureUserProfile } from "@/lib/services/profile";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Demo one-click login (§15): a shared demo account, separate from every
// real account, signed in server-side with DEMO_EMAIL. No secret gate —
// anyone may look around the demo. Reseed with `npm run db:seed-demo`;
// there is no auto-reset in v1.
export async function GET(request: NextRequest) {
  const unavailable = () =>
    NextResponse.redirect(new URL("/login?error=demo", request.url));
  const email = process.env.DEMO_EMAIL;
  if (!email) {
    return unavailable();
  }
  const admin = getAdminClient();
  const { data: link, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link?.properties?.email_otp;
  if (linkError || !otp) {
    return unavailable();
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (error || !data.user) {
    return unavailable();
  }
  await ensureUserProfile(data.user.id);
  return NextResponse.redirect(new URL("/", request.url));
}
