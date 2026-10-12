"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { saveLogAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { FieldError, inputCls, labelCls } from "@/components/ui/field";
import type { RunningTarget } from "@/lib/domain/master";
import { mintKey } from "@/lib/keys";
import {
  formatDateTh,
  formatTargetFullTh,
  weekdayTh,
} from "@/lib/format";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const FormSchema = z.object({
  performedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
  runningWorkoutCode: z.string().min(1, "เลือกประเภทซ้อม"),
  distanceKm: z.number({ message: "ใส่ระยะทางจริง" }).positive("ระยะต้องมากกว่า 0"),
  hours: z.number().int().min(0).max(23),
  minutes: z.number().int().min(0).max(59),
  seconds: z.number().int().min(0).max(59),
  elapsedHours: z.number().int().min(0).max(23).optional(),
  elapsedMinutes: z.number().int().min(0).max(59).optional(),
  elapsedSeconds: z.number().int().min(0).max(59).optional(),
  avgHeartRate: z.number().int().positive("หัวใจต้องมากกว่า 0").optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาแบบ 06:30")
    .optional(),
  outcome: z.enum(["COMPLETED", "PARTIAL"]),
  rpe: z.number().int().min(1, "RPE 1–10").max(10, "RPE 1–10").optional(),
  feeling: z.string().max(100, "ความรู้สึกยาวเกินไป").optional(),
  note: z.string().max(2000, "หมายเหตุยาวเกินไป").optional(),
});

type Values = z.infer<typeof FormSchema>;

type SplitRow = {
  key: string;
  distanceKm: string;
  minutes: string;
  seconds: string;
};

function blankSplit(): SplitRow {
  return { key: mintKey("sp"), distanceKm: "", minutes: "", seconds: "" };
}

export type LogMasterOption = {
  code: string;
  nameTh: string;
  nameEn: string;
};

function planRefText(
  target: RunningTarget | null | undefined,
): string | null {
  return formatTargetFullTh(target);
}

export function LogForm({
  planItemId,
  planDate,
  runningWorkoutCode,
  runningTarget,
  masters,
  today,
}: {
  planItemId?: string;
  planDate?: string;
  runningWorkoutCode: string;
  runningTarget?: RunningTarget | null;
  masters?: LogMasterOption[];
  today: string;
}) {
  const router = useRouter();
  const offPlan = planItemId === undefined;
  const idSuffix = planItemId ?? "offplan";
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [splitErrors, setSplitErrors] = useState<string[]>([]);
  // One id per form open: Retry reuses it (idempotent), a new open mints one.
  const [mutationId] = useState<string>(() => crypto.randomUUID());

  const form = useForm<Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      performedDate: planDate ?? today,
      runningWorkoutCode,
      hours: 0,
      minutes: 0,
      seconds: 0,
      outcome: "COMPLETED",
      note: "",
    },
  });

  const watchedDate = form.watch("performedDate");
  const planRef = planRefText(runningTarget);
  // Explicit user action only: fill typed-target values into actual fields.
  // Nothing is pre-filled on open (§6).
  function usePlanTarget() {
    if (runningTarget?.kind === "DISTANCE") {
      form.setValue("distanceKm", runningTarget.distanceM / 1000, {
        shouldValidate: true,
      });
    } else if (runningTarget?.kind === "DURATION") {
      const total = runningTarget.durationSec;
      form.setValue("hours", Math.floor(total / 3600), {
        shouldValidate: true,
      });
      form.setValue("minutes", Math.floor((total % 3600) / 60), {
        shouldValidate: true,
      });
      form.setValue("seconds", total % 60, { shouldValidate: true });
    }
    // STRUCTURED has no single typed target: the runner types actuals, with
    // the plan shown as reference (§6).
  }

  function patchSplit(key: string, patch: Partial<SplitRow>) {
    setSplits((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  const splitTotal = splits.reduce(
    (acc, r) => {
      const km = Number(r.distanceKm);
      const sec =
        (Number(r.minutes) || 0) * 60 + (Number(r.seconds) || 0);
      return {
        km:
          acc.km + (r.distanceKm.trim() !== "" && Number.isFinite(km) ? km : 0),
        sec: acc.sec + (r.minutes.trim() !== "" || r.seconds.trim() !== "" ? sec : 0),
      };
    },
    { km: 0, sec: 0 },
  );

  async function onSubmit(values: Values) {
    setServerError(null);
    const movingSec =
      values.hours * 3600 + values.minutes * 60 + values.seconds;
    if (movingSec <= 0) {
      form.setError("minutes", { message: "ใส่เวลาที่เคลื่อนไหวจริง" });
      return;
    }
    const elapsedFilled =
      values.elapsedHours !== undefined ||
      values.elapsedMinutes !== undefined ||
      values.elapsedSeconds !== undefined;
    const elapsedSec = elapsedFilled
      ? (values.elapsedHours ?? 0) * 3600 +
        (values.elapsedMinutes ?? 0) * 60 +
        (values.elapsedSeconds ?? 0)
      : undefined;
    if (elapsedSec !== undefined && elapsedSec < movingSec) {
      form.setError("elapsedMinutes", {
        message: "เวลารวมต้องไม่น้อยกว่าเวลาเคลื่อนไหว",
      });
      return;
    }
    const issues: string[] = [];
    const builtSplits: Array<{ distanceM?: number; durationSec?: number }> = [];
    for (const [i, row] of splits.entries()) {
      const hasDist = row.distanceKm.trim() !== "";
      const hasTime =
        row.minutes.trim() !== "" || row.seconds.trim() !== "";
      if (!hasDist && !hasTime) {
        issues.push(`รอบที่ ${i + 1}: ใส่ระยะหรือเวลาอย่างน้อยหนึ่งอย่าง`);
        continue;
      }
      const distanceM = hasDist ? Math.round(Number(row.distanceKm) * 1000) : undefined;
      const durationSec = hasTime
        ? (Number(row.minutes) || 0) * 60 + (Number(row.seconds) || 0)
        : undefined;
      if (
        (distanceM !== undefined && !(distanceM > 0)) ||
        (durationSec !== undefined && !(durationSec > 0))
      ) {
        issues.push(`รอบที่ ${i + 1}: ค่าต้องมากกว่า 0`);
        continue;
      }
      builtSplits.push({
        ...(distanceM !== undefined ? { distanceM } : {}),
        ...(durationSec !== undefined ? { durationSec } : {}),
      });
    }
    setSplitErrors(issues);
    if (issues.length > 0) return;
    const res = await saveLogAction({
      clientMutationId: mutationId,
      planItemId,
      performedDate: values.performedDate,
      runningWorkoutCode: offPlan
        ? values.runningWorkoutCode
        : runningWorkoutCode,
      distanceKm: values.distanceKm,
      hours: values.hours,
      minutes: values.minutes,
      seconds: values.seconds,
      elapsedSec,
      avgHeartRate: values.avgHeartRate,
      startTime: values.startTime,
      splits: builtSplits.length > 0 ? builtSplits : undefined,
      outcome: values.outcome,
      rpe: values.rpe,
      feeling: values.feeling,
      note: values.note,
    });
    if (!res.ok) {
      if (res.code === "UNAUTHENTICATED") {
        router.push(`/login?next=${encodeURIComponent("/plan")}`);
        return;
      }
      setServerError(res.message);
      return;
    }
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {offPlan ? "บันทึกวิ่งนอกแผน" : "บันทึกผล"}
      </Button>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mt-3 rounded-card border border-line bg-paper p-4"
      aria-label="ฟอร์มบันทึกผลจริง"
    >
      <div>
        <label className={labelCls} htmlFor={`performed-${idSuffix}`}>
          วันที่ซ้อมจริง
        </label>
        <input
          id={`performed-${idSuffix}`}
          type="date"
          max={today}
          className={inputCls}
          {...form.register("performedDate")}
        />
        <FieldError message={form.formState.errors.performedDate?.message} />
        {planDate && watchedDate !== planDate && (
          <p className="mt-1 text-sm text-muted">
            แผนวัน{weekdayTh(planDate)}ที่ {formatDateTh(planDate)} ·
            ทำจริงวัน{weekdayTh(watchedDate)}ที่ {formatDateTh(watchedDate)} ·
            ความสำเร็จนับกับสัปดาห์แผน ระยะสะสมนับวันที่ทำจริง
          </p>
        )}
      </div>

      {offPlan && masters && (
        <div className="mt-3">
          <label className={labelCls} htmlFor={`code-${idSuffix}`}>
            ประเภทซ้อม
          </label>
          <select
            id={`code-${idSuffix}`}
            className={inputCls}
            {...form.register("runningWorkoutCode")}
          >
            {masters.map((m) => (
              <option key={m.code} value={m.code}>
                {m.nameTh} · {m.nameEn}
              </option>
            ))}
          </select>
          <FieldError
            message={form.formState.errors.runningWorkoutCode?.message}
          />
        </div>
      )}

      <div className="mt-3">
        <label className={labelCls} htmlFor={`actual-dist-${idSuffix}`}>
          ระยะทางจริง (km)
        </label>
        {planRef && (
          <p className="mb-1 text-sm text-muted">
            แผน {planRef}
            {(runningTarget?.kind === "DISTANCE" ||
              runningTarget?.kind === "DURATION") && (
              <>
                {" · "}
                <button
                  type="button"
                  className="min-h-11 font-medium text-forest underline underline-offset-4"
                  onClick={usePlanTarget}
                >
                  ใช้ค่าเป้าหมายเป็นผลจริง
                </button>
              </>
            )}
          </p>
        )}
        <input
          id={`actual-dist-${idSuffix}`}
          type="number"
          step="0.1"
          min="0"
          inputMode="decimal"
          className={inputCls}
          {...form.register("distanceKm", { valueAsNumber: true })}
        />
        <FieldError message={form.formState.errors.distanceKm?.message} />
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">
          เวลาที่เคลื่อนไหวจริง
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls} htmlFor={`h-${idSuffix}`}>
              ชม.
            </label>
            <input
              id={`h-${idSuffix}`}
              type="number"
              min="0"
              max="23"
              inputMode="numeric"
              className={inputCls}
              {...form.register("hours", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`m-${idSuffix}`}>
              นาที
            </label>
            <input
              id={`m-${idSuffix}`}
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              className={inputCls}
              {...form.register("minutes", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`s-${idSuffix}`}>
              วินาที
            </label>
            <input
              id={`s-${idSuffix}`}
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              className={inputCls}
              {...form.register("seconds", { valueAsNumber: true })}
            />
          </div>
        </div>
        <FieldError
          message={
            form.formState.errors.hours?.message ??
            form.formState.errors.minutes?.message ??
            form.formState.errors.seconds?.message
          }
        />
      </fieldset>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">
          เวลารวมทั้งหมด (ถ้ามี)
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls} htmlFor={`eh-${idSuffix}`}>
              ชม.
            </label>
            <input
              id={`eh-${idSuffix}`}
              type="number"
              min="0"
              max="23"
              inputMode="numeric"
              className={inputCls}
              {...form.register("elapsedHours", {
                setValueAs: (v) =>
                  v === "" || v === null ? undefined : Number(v),
              })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`em-${idSuffix}`}>
              นาทีรวม
            </label>
            <input
              id={`em-${idSuffix}`}
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              className={inputCls}
              {...form.register("elapsedMinutes", {
                setValueAs: (v) =>
                  v === "" || v === null ? undefined : Number(v),
              })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`es-${idSuffix}`}>
              วินาทีรวม
            </label>
            <input
              id={`es-${idSuffix}`}
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              className={inputCls}
              {...form.register("elapsedSeconds", {
                setValueAs: (v) =>
                  v === "" || v === null ? undefined : Number(v),
              })}
            />
          </div>
        </div>
        <FieldError
          message={
            form.formState.errors.elapsedHours?.message ??
            form.formState.errors.elapsedMinutes?.message ??
            form.formState.errors.elapsedSeconds?.message
          }
        />
      </fieldset>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor={`hr-${idSuffix}`}>
            HR เฉลี่ย (ถ้ามี)
          </label>
          <input
            id={`hr-${idSuffix}`}
            type="number"
            min="0"
            inputMode="numeric"
            className={inputCls}
            {...form.register("avgHeartRate", {
              setValueAs: (v) =>
                v === "" || v === null ? undefined : Number(v),
            })}
          />
          <FieldError message={form.formState.errors.avgHeartRate?.message} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`start-${idSuffix}`}>
            เวลาเริ่ม (ถ้ามี)
          </label>
          <input
            id={`start-${idSuffix}`}
            type="text"
            inputMode="numeric"
            placeholder="06:30"
            className={inputCls}
            {...form.register("startTime", { setValueAs: emptyToUndefined })}
          />
          <FieldError message={form.formState.errors.startTime?.message} />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">รอบที่วัดได้ (ถ้ามี)</h3>
          <button
            type="button"
            onClick={() => setSplits((prev) => [...prev, blankSplit()])}
            className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
          >
            เพิ่มรอบ
          </button>
        </div>
        {planRef && (
          <p className="mt-1 text-sm text-muted">แผนอ้างอิง: {planRef}</p>
        )}
        {splits.length === 0 && (
          <p className="mt-1 text-sm text-muted">
            ไม่บังคับ รอบละระยะหรือเวลาอย่างน้อยหนึ่งอย่าง
          </p>
        )}
        <ol className="mt-2 space-y-2">
          {splits.map((row, i) => (
            <li
              key={row.key}
              className="rounded-button border border-line p-3"
            >
              <p className="text-base font-medium">รอบที่ {i + 1}</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <label
                    className={labelCls}
                    htmlFor={`sp-dist-${idSuffix}-${row.key}`}
                  >
                    กม.
                  </label>
                  <input
                    id={`sp-dist-${idSuffix}-${row.key}`}
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    className={inputCls}
                    value={row.distanceKm}
                    onChange={(e) =>
                      patchSplit(row.key, { distanceKm: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className={labelCls}
                    htmlFor={`sp-m-${idSuffix}-${row.key}`}
                  >
                    นาที
                  </label>
                  <input
                    id={`sp-m-${idSuffix}-${row.key}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                    value={row.minutes}
                    onChange={(e) =>
                      patchSplit(row.key, { minutes: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className={labelCls}
                    htmlFor={`sp-s-${idSuffix}-${row.key}`}
                  >
                    วินาที
                  </label>
                  <input
                    id={`sp-s-${idSuffix}-${row.key}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                    value={row.seconds}
                    onChange={(e) =>
                      patchSplit(row.key, { seconds: e.target.value })
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSplits((prev) => prev.filter((r) => r.key !== row.key))
                }
                className="mt-1 inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
              >
                เอารอบนี้ออก
              </button>
            </li>
          ))}
        </ol>
        {splits.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            รวมรอบ: {splitTotal.km} km · {splitTotal.sec} วินาที
            (อ้างอิงเท่านั้น สถิติใช้ค่าที่กรอกด้านบน)
          </p>
        )}
        {splitErrors.length > 0 && (
          <div role="alert" className="mt-2 text-base text-charcoal">
            <ul className="list-disc space-y-1 pl-5">
              {splitErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">ผล</legend>
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              value="COMPLETED"
              {...form.register("outcome")}
              className="size-5"
            />
            เสร็จแล้ว
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              value="PARTIAL"
              {...form.register("outcome")}
              className="size-5"
            />
            ทำบางส่วน
          </label>
        </div>
      </fieldset>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`rpe-${idSuffix}`}>
          RPE 1–10 (ถ้ามี)
        </label>
        <input
          id={`rpe-${idSuffix}`}
          type="number"
          min="1"
          max="10"
          inputMode="numeric"
          className={inputCls}
          {...form.register("rpe", {
            setValueAs: (v) =>
              v === "" || v === null ? undefined : Number(v),
          })}
        />
        <FieldError message={form.formState.errors.rpe?.message} />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`feeling-${idSuffix}`}>
          ความรู้สึก (ถ้ามี)
        </label>
        <input
          id={`feeling-${idSuffix}`}
          type="text"
          maxLength={100}
          className={inputCls}
          {...form.register("feeling")}
        />
        <FieldError message={form.formState.errors.feeling?.message} />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`log-note-${idSuffix}`}>
          หมายเหตุ
        </label>
        <input
          id={`log-note-${idSuffix}`}
          type="text"
          className={inputCls}
          {...form.register("note")}
        />
        <FieldError message={form.formState.errors.note?.message} />
      </div>

      {serverError && (
        <p role="alert" className="mt-3 text-base text-charcoal">
          {serverError}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "กำลังบันทึก…" : "บันทึกผลจริง"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={form.formState.isSubmitting}
        >
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
