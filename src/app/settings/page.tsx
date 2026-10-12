import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Download, UserRound } from "lucide-react";

import { getSessionUserId } from "@/lib/auth/session";
import { ensureUserProfile, getOwnProfile } from "@/lib/services/profile";
import { ExportButton } from "@/features/settings/export-button";
import { SettingsForm } from "@/features/settings/settings-form";

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
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login?next=%2Fsettings");
  }
  const existing = await getOwnProfile(userId);
  const profile = existing ?? (await ensureUserProfile(userId));
  const displayName = profile.displayName?.trim() || "นักวิ่ง";
  return (
    <div className="app-page">
      <h1 className="page-title">ตั้งค่า</h1>
      <p className="mt-1 text-sm text-muted">จัดการโปรไฟล์และข้อมูลการซ้อม</p>

      <div className="mt-4 flex items-center gap-4 rounded-[18px] bg-[#f6f4ef] p-4">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-forest text-2xl font-medium text-lime"
        >
          {displayName[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted">โปรไฟล์ของคุณ</p>
          <p className="mt-0.5 break-words text-xl font-semibold">
            {displayName}
          </p>
          <p className="mt-0.5 text-xs text-muted">{profile.timezone}</p>
        </div>
      </div>

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
            initialDisplayName={profile.displayName}
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
