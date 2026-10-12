"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/session";
import {
  updateOwnProfile,
  type UserProfileUpdate,
} from "@/lib/services/profile";
import { ServiceError } from "@/lib/services/errors";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export async function signOutAction(): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      return {
        ok: false,
        code: "SIGN_OUT_FAILED",
        message: "ออกจากระบบไม่สำเร็จ ลองอีกครั้ง",
      };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "UNKNOWN",
      message: "เชื่อมต่อไม่ได้ ลองออกจากระบบอีกครั้ง",
    };
  }
}

export async function updateProfileAction(
  input: UserProfileUpdate,
): Promise<SettingsActionResult> {
  try {
    const userId = await requireUserId();
    await updateOwnProfile(userId, input);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.code === "UNAUTHENTICATED") {
        return { ok: false, code: err.code, message: "กรุณาเข้าสู่ระบบก่อน" };
      }
      return { ok: false, code: err.code, message: err.message };
    }
    return { ok: false, code: "UNKNOWN", message: "บันทึกไม่สำเร็จ ลองใหม่" };
  }
}
