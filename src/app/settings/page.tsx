import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Download, Mail, UserRound } from "lucide-react";

import { getSessionUser } from "@/lib/auth/session";
import { ensureUserProfile, getOwnProfile } from "@/lib/services/profile";
import { ExportButton } from "@/features/settings/export-button";
import { SettingsForm } from "@/features/settings/settings-form";
import { SignOutButton } from "@/features/settings/sign-out-button";

function SettingsFallback() {
  return (
    <div className="app-page">
      <h1 className="page-title">ตั้งค่า</h1>
      <p className="mt-2 text-sm text-muted">กำลังโหลดการตั้งค่า…</p>
    </div>
  );
}

async function SettingsContent() {
  await connection();
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=%2Fsettings");
  }
  const existing = await getOwnProfile(user.id);
  const profile = existing ?? (await ensureUserProfile(user.id));
  const displayName = profile.displayName?.trim() || user.displayName;
  return (
    <div className="app-page">
      <h1 className="page-title">ตั้งค่า</h1>
      <p className="mt-1 text-sm text-muted">จัดการโปรไฟล์และข้อมูลการซ้อม</p>

      <section
        aria-label="บัญชีที่เข้าสู่ระบบ"
        className="mt-4 rounded-[18px] bg-[#f6f4ef] p-4"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-forest text-xl font-medium text-lime"
          >
            {displayName[0]?.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">บัญชีที่เข้าสู่ระบบ</p>
            <p className="mt-0.5 break-words text-xl font-semibold">
              {displayName}
            </p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-all">
            {user.email ?? "ไม่พบอีเมลของบัญชีนี้"}
          </span>
        </p>
        <div className="mt-4 border-t border-line pt-3">
          <SignOutButton />
        </div>
      </section>

      <section aria-labelledby="profile-heading" className="surface mt-4">
        <h2
          id="profile-heading"
          className="section-title flex items-center gap-2"
        >
          <UserRound className="size-5 text-forest" aria-hidden />
          โปรไฟล์
        </h2>
        <div className="mt-4">
          <SettingsForm
            initialDisplayName={profile.displayName ?? user.displayName}
            initialTimezone={profile.timezone}
          />
        </div>
      </section>

      <section aria-labelledby="export-heading" className="surface mt-4">
        <h2
          id="export-heading"
          className="section-title flex items-center gap-2"
        >
          <Download className="size-5 text-forest" aria-hidden />
          ส่งออกข้อมูล
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          เก็บสำเนาแผน บันทึก เป้าหมาย และเทมเพลตทั้งหมดของคุณเป็นไฟล์ JSON
        </p>
        <div className="mt-4">
          <ExportButton />
        </div>
      </section>
      <p className="mt-5 text-center text-xs text-muted">
        Runfolio · สมุดซ้อมส่วนตัวของคุณ
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </Suspense>
  );
}
