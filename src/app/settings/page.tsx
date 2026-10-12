import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  ensureUserProfile,
  getOwnProfile,
} from "@/lib/services/profile";
import { ExportButton } from "@/features/settings/export-button";
import { SettingsForm } from "@/features/settings/settings-form";

function SettingsFallback() {
  return (
    <div>
      <h1 className="text-3xl font-semibold sm:text-4xl">ตั้งค่า</h1>
      <p className="mt-2 text-base text-muted">กำลังโหลดการตั้งค่า…</p>
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
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold sm:text-4xl">ตั้งค่า</h1>

      <section
        aria-labelledby="profile-heading"
        className="mt-6 rounded-card border border-line bg-paper p-6"
      >
        <h2 id="profile-heading" className="text-xl font-semibold">
          โปรไฟล์
        </h2>
        <div className="mt-4">
          <SettingsForm
            initialDisplayName={profile.displayName}
            initialTimezone={profile.timezone}
          />
        </div>
      </section>

      <section
        aria-labelledby="export-heading"
        className="mt-6 rounded-card border border-line bg-paper p-6"
      >
        <h2 id="export-heading" className="text-xl font-semibold">
          ส่งออกข้อมูล
        </h2>
        <p className="mt-2 text-base text-muted">
          ดาวน์โหลดแผน ผลซ้อม เป้าหมาย และเทมเพลตทั้งหมดของคุณเป็นไฟล์ JSON
          ไฟล์นี้อ่านประวัติได้โดยไม่ต้องพึ่งข้อมูลมาสเตอร์ปัจจุบัน
        </p>
        <div className="mt-4">
          <ExportButton />
        </div>
      </section>
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
