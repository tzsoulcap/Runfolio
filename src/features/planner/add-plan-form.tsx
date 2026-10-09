"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addPlanAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { FieldError, inputCls, labelCls } from "@/components/ui/field";
import type { RunningTarget } from "@/lib/domain/master";

export type MasterOption = {
  code: string;
  nameTh: string;
  nameEn: string;
  defaultTarget: RunningTarget | null;
};

const FormSchema = z
  .object({
    runningWorkoutCode: z.string().min(1, "เลือกประเภทซ้อม"),
    targetKind: z.enum(["DISTANCE", "DURATION"]),
    distanceKm: z.number().optional(),
    durationMin: z.number().optional(),
    plannedStartTime: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "เวลาแบบ 06:30")
      .optional(),
    note: z.string().max(2000, "หมายเหตุยาวเกินไป").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.targetKind === "DISTANCE" && !(Number(v.distanceKm) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["distanceKm"],
        message: "ใส่ระยะทางมากกว่า 0",
      });
    }
    if (v.targetKind === "DURATION" && !(Number(v.durationMin) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["durationMin"],
        message: "ใส่เวลามากกว่า 0",
      });
    }
  });

type Values = z.infer<typeof FormSchema>;

function defaultsFor(master: MasterOption): Partial<Values> {
  const t = master.defaultTarget;
  if (t?.kind === "DISTANCE") {
    return { targetKind: "DISTANCE", distanceKm: t.distanceM / 1000 };
  }
  if (t?.kind === "DURATION") {
    return { targetKind: "DURATION", durationMin: t.durationSec / 60 };
  }
  return { targetKind: "DISTANCE", distanceKm: undefined };
}

export function AddPlanForm({
  date,
  masters,
  revision,
}: {
  date: string;
  masters: MasterOption[];
  revision: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const initial = masters.find((m) => m.code === "EASY_RUN") ?? masters[0];

  const form = useForm<Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      runningWorkoutCode: initial?.code ?? "",
      plannedStartTime: "",
      note: "",
      ...defaultsFor(
        initial ?? { code: "", nameTh: "", nameEn: "", defaultTarget: null },
      ),
    },
  });
  const targetKind = form.watch("targetKind");

  function onWorkoutChange(code: string) {
    const master = masters.find((m) => m.code === code);
    form.setValue("runningWorkoutCode", code);
    if (master) {
      const d = defaultsFor(master);
      if (d.targetKind) form.setValue("targetKind", d.targetKind);
      form.setValue("distanceKm", d.distanceKm);
      form.setValue("durationMin", d.durationMin);
    }
  }

  async function onSubmit(values: Values) {
    setServerError(null);
    const res = await addPlanAction({
      date,
      runningWorkoutCode: values.runningWorkoutCode,
      targetKind: values.targetKind,
      distanceKm: values.distanceKm,
      durationMin: values.durationMin,
      plannedStartTime: values.plannedStartTime,
      note: values.note,
      expectedRevision: revision,
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
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`เพิ่มการซ้อมวันที่ ${date}`}
      >
        เพิ่มการซ้อม
      </Button>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="rounded-card border border-line bg-paper p-4"
      aria-label={`ฟอร์มเพิ่มแผนวันที่ ${date}`}
    >
      <div>
        <label className={labelCls} htmlFor={`workout-${date}`}>
          ประเภทซ้อม
        </label>
        <select
          id={`workout-${date}`}
          className={inputCls}
          {...form.register("runningWorkoutCode", {
            onChange: (e) => onWorkoutChange(e.target.value),
          })}
        >
          {masters.map((m) => (
            <option key={m.code} value={m.code}>
              {m.nameEn} · {m.nameTh}
            </option>
          ))}
        </select>
        <FieldError
          message={form.formState.errors.runningWorkoutCode?.message}
        />
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">
          เป้าหมายหลัก
        </legend>
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              value="DISTANCE"
              {...form.register("targetKind")}
              className="size-5"
            />
            ระยะทาง
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              value="DURATION"
              {...form.register("targetKind")}
              className="size-5"
            />
            เวลา
          </label>
        </div>
      </fieldset>

      {targetKind === "DISTANCE" ? (
        <div className="mt-3">
          <label className={labelCls} htmlFor={`dist-${date}`}>
            ระยะทาง (km)
          </label>
          <input
            id={`dist-${date}`}
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            className={inputCls}
            {...form.register("distanceKm", { valueAsNumber: true })}
          />
          <FieldError message={form.formState.errors.distanceKm?.message} />
        </div>
      ) : (
        <div className="mt-3">
          <label className={labelCls} htmlFor={`dur-${date}`}>
            เวลา (นาที)
          </label>
          <input
            id={`dur-${date}`}
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            className={inputCls}
            {...form.register("durationMin", { valueAsNumber: true })}
          />
          <FieldError message={form.formState.errors.durationMin?.message} />
        </div>
      )}

      <div className="mt-3">
        <label className={labelCls} htmlFor={`time-${date}`}>
          เวลาเริ่ม (ถ้ามี)
        </label>
        <input
          id={`time-${date}`}
          type="time"
          className={inputCls}
          {...form.register("plannedStartTime")}
        />
        <FieldError
          message={form.formState.errors.plannedStartTime?.message}
        />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`note-${date}`}>
          หมายเหตุ
        </label>
        <input
          id={`note-${date}`}
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
          {form.formState.isSubmitting ? "กำลังบันทึก…" : "เพิ่มแผน"}
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
