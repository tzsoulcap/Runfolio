"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createGoalAction,
  updateGoalAction,
} from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import { GOAL_DISTANCES } from "@/lib/domain/goal";

export type GoalFormInitial = {
  distanceCode: string;
  goalType: "FINISH" | "TARGET_TIME";
  eventName: string;
  eventDate: string;
  targetHours: string;
  targetMinutes: string;
  targetSeconds: string;
};

function emptyInitial(): GoalFormInitial {
  return {
    distanceCode: "10K",
    goalType: "FINISH",
    eventName: "",
    eventDate: "",
    targetHours: "",
    targetMinutes: "",
    targetSeconds: "",
  };
}

export function GoalForm({
  goalId,
  initial,
  idSuffix,
}: {
  goalId?: string;
  initial?: GoalFormInitial;
  idSuffix: string;
}) {
  const router = useRouter();
  const isEdit = goalId !== undefined;
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [distanceCode, setDistanceCode] = useState(
    initial?.distanceCode ?? "10K",
  );
  const [goalType, setGoalType] = useState<"FINISH" | "TARGET_TIME">(
    initial?.goalType ?? "FINISH",
  );
  const [eventName, setEventName] = useState(initial?.eventName ?? "");
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [targetHours, setTargetHours] = useState(
    initial?.targetHours ?? "",
  );
  const [targetMinutes, setTargetMinutes] = useState(
    initial?.targetMinutes ?? "",
  );
  const [targetSeconds, setTargetSeconds] = useState(
    initial?.targetSeconds ?? "",
  );
  const [isPrimary, setIsPrimary] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found: string[] = [];
    if (!(distanceCode in GOAL_DISTANCES)) found.push("เลือกระยะทาง");
    if (eventName.length > 200) found.push("ชื่องานยาวเกินไป");
    if (
      eventDate.trim() !== "" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())
    ) {
      found.push("วันที่ไม่ถูกต้อง");
    }
    const parseTarget = (raw: string, max: number) => {
      if (raw.trim() === "") return undefined;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
    };
    const targetH = parseTarget(targetHours, 23);
    const targetM = parseTarget(targetMinutes, 59);
    const targetS = parseTarget(targetSeconds, 59);
    if (goalType === "TARGET_TIME") {
      if (targetH === null || targetM === null || targetS === null) {
        found.push("เวลาเป้าหมายไม่ถูกต้อง");
      } else if (
        (targetH ?? 0) * 3600 + (targetM ?? 0) * 60 + (targetS ?? 0) <=
        0
      ) {
        found.push("ใส่เวลาเป้าหมายมากกว่า 0");
      }
    }
    setIssues(found);
    if (found.length > 0) return;

    setSubmitting(true);
    try {
      const fields = {
        distanceCode,
        goalType,
        eventName: eventName.trim() === "" ? undefined : eventName.trim(),
        eventDate: eventDate.trim() === "" ? undefined : eventDate.trim(),
        targetHours: targetH ?? undefined,
        targetMinutes: targetM ?? undefined,
        targetSeconds: targetS ?? undefined,
      };
      const res = isEdit
        ? await updateGoalAction({ goalId, ...fields })
        : await createGoalAction({ ...fields, isPrimary });
      if (!res.ok) {
        if (res.code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent("/goals")}`);
          return;
        }
        setServerError(res.message);
        return;
      }
      setOpen(false);
      if (!isEdit) {
        const fresh = emptyInitial();
        setDistanceCode(fresh.distanceCode);
        setGoalType(fresh.goalType);
        setEventName("");
        setEventDate("");
        setTargetHours("");
        setTargetMinutes("");
        setTargetSeconds("");
        setIsPrimary(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        {isEdit ? "แก้ไขเป้าหมาย" : "เพิ่มเป้าหมาย"}
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-card border border-line bg-paper p-4"
      aria-label={isEdit ? "ฟอร์มแก้ไขเป้าหมาย" : "ฟอร์มเพิ่มเป้าหมาย"}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor={`goal-dist-${idSuffix}`}>
            ระยะทาง
          </label>
          <select
            id={`goal-dist-${idSuffix}`}
            className={inputCls}
            value={distanceCode}
            onChange={(e) => setDistanceCode(e.target.value)}
          >
            {(Object.keys(GOAL_DISTANCES) as Array<keyof typeof GOAL_DISTANCES>).map(
              (code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={`goal-date-${idSuffix}`}>
            วันแข่ง (ถ้ามี)
          </label>
          <input
            id={`goal-date-${idSuffix}`}
            type="date"
            className={inputCls}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">
          ชนิดเป้าหมาย
        </legend>
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name={`goal-type-${idSuffix}`}
              value="FINISH"
              checked={goalType === "FINISH"}
              onChange={() => setGoalType("FINISH")}
              className="size-5"
            />
            จบการแข่งขัน
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name={`goal-type-${idSuffix}`}
              value="TARGET_TIME"
              checked={goalType === "TARGET_TIME"}
              onChange={() => setGoalType("TARGET_TIME")}
              className="size-5"
            />
            ทำเวลา
          </label>
        </div>
      </fieldset>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`goal-name-${idSuffix}`}>
          ชื่องาน (ถ้ามี)
        </label>
        <input
          id={`goal-name-${idSuffix}`}
          type="text"
          maxLength={200}
          className={inputCls}
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
        />
      </div>

      {goalType === "TARGET_TIME" && (
        <fieldset className="mt-3">
          <legend className="mb-1 text-sm font-medium text-charcoal">
            เวลาเป้าหมาย
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls} htmlFor={`goal-th-${idSuffix}`}>
                ชม.
              </label>
              <input
                id={`goal-th-${idSuffix}`}
                type="number"
                min="0"
                max="23"
                inputMode="numeric"
                className={inputCls}
                value={targetHours}
                onChange={(e) => setTargetHours(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`goal-tm-${idSuffix}`}>
                นาที
              </label>
              <input
                id={`goal-tm-${idSuffix}`}
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                className={inputCls}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`goal-ts-${idSuffix}`}>
                วินาที
              </label>
              <input
                id={`goal-ts-${idSuffix}`}
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                className={inputCls}
                value={targetSeconds}
                onChange={(e) => setTargetSeconds(e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      )}

      {!isEdit && (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-base">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="size-5"
          />
          ตั้งเป็นเป้าหมายหลัก
        </label>
      )}

      {issues.length > 0 && (
        <div role="alert" className="mt-3 text-base text-charcoal">
          <ul className="list-disc space-y-1 pl-5">
            {issues.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      {serverError && (
        <p role="alert" className="mt-3 text-base text-charcoal">
          {serverError}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "กำลังบันทึก…"
            : isEdit
              ? "บันทึกการแก้ไข"
              : "เพิ่มเป้าหมาย"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
