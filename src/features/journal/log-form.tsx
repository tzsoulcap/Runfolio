"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { saveLogAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { FieldError, inputCls, labelCls } from "@/components/ui/field";

const FormSchema = z.object({
  performedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
  distanceKm: z.number({ message: "ใส่ระยะทางจริง" }).positive("ระยะต้องมากกว่า 0"),
  hours: z.number().int().min(0).max(23),
  minutes: z.number().int().min(0).max(59),
  seconds: z.number().int().min(0).max(59),
  outcome: z.enum(["COMPLETED", "PARTIAL"]),
  rpe: z.number().int().min(1, "RPE 1–10").max(10, "RPE 1–10").optional(),
  note: z.string().max(2000, "หมายเหตุยาวเกินไป").optional(),
});

type Values = z.infer<typeof FormSchema>;

export function LogForm({
  planItemId,
  planDate,
  runningWorkoutCode,
  defaultDistanceKm,
  today,
}: {
  planItemId: string;
  planDate: string;
  runningWorkoutCode: string;
  defaultDistanceKm?: number;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // One id per form open: Retry reuses it (idempotent), a new open mints one.
  const [mutationId] = useState<string>(() => crypto.randomUUID());

  const form = useForm<Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      performedDate: planDate,
      hours: 0,
      minutes: 0,
      seconds: 0,
      outcome: "COMPLETED",
      note: "",
    },
  });

  async function onSubmit(values: Values) {
    setServerError(null);
    if (
      values.hours * 3600 + values.minutes * 60 + values.seconds <= 0
    ) {
      form.setError("minutes", { message: "ใส่เวลาที่เคลื่อนไหวจริง" });
      return;
    }
    const res = await saveLogAction({
      clientMutationId: mutationId,
      planItemId,
      performedDate: values.performedDate,
      runningWorkoutCode,
      distanceKm: values.distanceKm,
      hours: values.hours,
      minutes: values.minutes,
      seconds: values.seconds,
      outcome: values.outcome,
      rpe: values.rpe,
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
    // No router.refresh() needed: saveLogAction revalidates /plan and the
    // action response already carries the fresh week (the detail link appears
    // without a second fetch).
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        บันทึกผล
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
        <label className={labelCls} htmlFor={`performed-${planItemId}`}>
          วันที่ซ้อมจริง
        </label>
        <input
          id={`performed-${planItemId}`}
          type="date"
          max={today}
          className={inputCls}
          {...form.register("performedDate")}
        />
        <FieldError message={form.formState.errors.performedDate?.message} />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`actual-dist-${planItemId}`}>
          ระยะทางจริง (km)
        </label>
        {defaultDistanceKm !== undefined && (
          <p className="mb-1 text-sm text-muted">
            แผน {defaultDistanceKm} km ·{" "}
            <button
              type="button"
              className="min-h-11 font-medium text-forest underline underline-offset-4"
              onClick={() =>
                form.setValue("distanceKm", defaultDistanceKm, {
                  shouldValidate: true,
                })
              }
            >
              ใช้ค่าแผน
            </button>
          </p>
        )}
        <input
          id={`actual-dist-${planItemId}`}
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
            <label className={labelCls} htmlFor={`h-${planItemId}`}>
              ชม.
            </label>
            <input
              id={`h-${planItemId}`}
              type="number"
              min="0"
              max="23"
              inputMode="numeric"
              className={inputCls}
              {...form.register("hours", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`m-${planItemId}`}>
              นาที
            </label>
            <input
              id={`m-${planItemId}`}
              type="number"
              min="0"
              max="59"
              inputMode="numeric"
              className={inputCls}
              {...form.register("minutes", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`s-${planItemId}`}>
              วินาที
            </label>
            <input
              id={`s-${planItemId}`}
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
        <label className={labelCls} htmlFor={`rpe-${planItemId}`}>
          RPE 1–10 (ถ้ามี)
        </label>
        <input
          id={`rpe-${planItemId}`}
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
        <label className={labelCls} htmlFor={`log-note-${planItemId}`}>
          หมายเหตุ
        </label>
        <input
          id={`log-note-${planItemId}`}
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
