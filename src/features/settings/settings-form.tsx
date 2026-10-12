"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateProfileAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { FieldError, inputCls, labelCls } from "@/components/ui/field";

const TIMEZONES = [
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Pacific/Auckland",
  "UTC",
];

function useOnline() {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  return online;
}

export function SettingsForm({
  initialDisplayName,
  initialTimezone,
}: {
  initialDisplayName: string | null;
  initialTimezone: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = TIMEZONES.includes(timezone)
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (!online || !navigator.onLine) {
      // §17 Offline: say so, keep the draft, never show success.
      setError("ออฟไลน์อยู่ บันทึกไม่ได้ ค่าที่กรอกยังอยู่ ลองใหม่เมื่อกลับมาออนไลน์");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await updateProfileAction({
        displayName,
        timezone,
      });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push("/login?next=%2Fsettings");
          return;
        }
        setError(res.message);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่ได้ ค่าที่กรอกยังอยู่ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div>
        <label htmlFor="displayName" className={labelCls}>
          ชื่อที่แสดง
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="nickname"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="เช่น นักวิ่งเช้าวันอาทิตย์"
          className={inputCls}
        />
      </div>
      <div className="mt-4">
        <label htmlFor="timezone" className={labelCls}>
          เขตเวลา
        </label>
        <select
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={inputCls}
        >
          {options.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">
          เปลี่ยนเขตเวลาแล้ววันที่ของแผนและผลเดิมไม่เลื่อน
        </p>
      </div>
      {error && (
        <div className="mt-4">
          <FieldError message={error} />
        </div>
      )}
      {saved && !error && (
        <p role="status" className="mt-4 text-sm text-charcoal">
          บันทึกโปรไฟล์แล้ว
        </p>
      )}
      <div className="mt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
        </Button>
      </div>
    </form>
  );
}
