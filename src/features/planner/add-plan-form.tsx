"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addPlanAction, setRestDayAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { FieldError, inputCls, labelCls } from "@/components/ui/field";
import type { RunningTarget } from "@/lib/domain/master";
import type { GoalOption } from "@/lib/services/goals";
import { formatDistanceM, parsePaceInput } from "@/lib/format";

import {
  blankBlock,
  parseStructuredTarget,
  StructuredEditor,
  targetToBlocks,
  type BlockState,
} from "./structured-editor";

export type MasterOption = {
  code: string;
  nameTh: string;
  nameEn: string;
  defaultTarget: RunningTarget | null;
  zoneMin: number | null;
  zoneMax: number | null;
};

export type RestBlockers = {
  unloggedCount: number;
  loggedCount: number;
};

// RHF valueAsNumber yields NaN for empty inputs; accept it and normalize to
// undefined so the Thai superRefine messages (not Zod's raw type error)
// reach the user. Union+transform keeps input/output types as number.
const numOptional = z
  .union([z.number(), z.nan()])
  .optional()
  .transform((v) =>
    v === undefined || (typeof v === "number" && Number.isNaN(v))
      ? undefined
      : v,
  );

const FormSchema = z
  .object({
    runningWorkoutCode: z.string().min(1, "เลือกประเภทซ้อม"),
    targetKind: z.enum(["DISTANCE", "DURATION", "STRUCTURED"]),
    distanceKm: numOptional,
    durationMin: numOptional,
    estimatedKm: numOptional,
    goalId: z.string().optional(),
    intensityKind: z.enum(["NONE", "HR_ZONE", "PACE", "EFFORT"]),
    zoneMin: numOptional,
    zoneMax: numOptional,
    paceFast: z.string().optional(),
    paceSlow: z.string().optional(),
    effortLabel: z.string().optional(),
    plannedStartTime: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "เวลาแบบ 06:30")
      .optional(),
    note: z.string().max(2000, "หมายเหตุยาวเกินไป").optional(),
    removeUnlogged: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (v.runningWorkoutCode === "REST") return;
    if (v.runningWorkoutCode === "RACE_DAY") {
      if (!v.goalId) issue(["goalId"], "เลือกเป้าหมายสำหรับวันแข่งขัน");
    } else if (v.targetKind === "DISTANCE") {
      if (!(Number(v.distanceKm) > 0))
        issue(["distanceKm"], "ใส่ระยะทางมากกว่า 0");
    } else if (v.targetKind === "DURATION") {
      if (!(Number(v.durationMin) > 0))
        issue(["durationMin"], "ใส่เวลามากกว่า 0");
    }
    if (
      v.estimatedKm !== undefined &&
      !Number.isNaN(v.estimatedKm) &&
      !(v.estimatedKm > 0)
    ) {
      issue(["estimatedKm"], "ระยะโดยประมาณต้องมากกว่า 0");
    }
    if (v.intensityKind === "HR_ZONE") {
      const ok = (z: unknown) =>
        typeof z === "number" && Number.isInteger(z) && z >= 1 && z <= 5;
      if (!ok(v.zoneMin)) issue(["zoneMin"], "โซน 1–5");
      if (!ok(v.zoneMax)) issue(["zoneMax"], "โซน 1–5");
      if (
        ok(v.zoneMin) &&
        ok(v.zoneMax) &&
        (v.zoneMin as number) > (v.zoneMax as number)
      ) {
        issue(["zoneMin"], "โซนต่ำสุดต้องไม่เกินโซนสูงสุด");
      }
    }
    if (v.intensityKind === "PACE") {
      const fast = parsePaceInput(v.paceFast ?? "");
      const slow = parsePaceInput(v.paceSlow ?? "");
      if (fast === null) issue(["paceFast"], "pace แบบ 6:40");
      if (slow === null) issue(["paceSlow"], "pace แบบ 6:40");
      if (fast !== null && slow !== null && fast > slow)
        issue(["paceFast"], "pace เร็วต้องไม่ช้ากว่า pace ช้า");
    }
    if (v.intensityKind === "EFFORT" && (v.effortLabel ?? "").trim() === "") {
      issue(["effortLabel"], "ใส่ระดับความหนัก");
    }
  });

type Values = z.output<typeof FormSchema>;
type FormInput = z.input<typeof FormSchema>;

function targetDefaults(master: MasterOption): {
  targetKind: Values["targetKind"];
  distanceKm?: number;
  durationMin?: number;
} {
  const t = master.defaultTarget;
  if (t?.kind === "DISTANCE")
    return { targetKind: "DISTANCE", distanceKm: t.distanceM / 1000 };
  if (t?.kind === "DURATION")
    return { targetKind: "DURATION", durationMin: t.durationSec / 60 };
  if (t?.kind === "STRUCTURED") return { targetKind: "STRUCTURED" };
  return { targetKind: "DISTANCE", distanceKm: undefined };
}

function intensityDefaults(master: MasterOption): {
  intensityKind: Values["intensityKind"];
  zoneMin?: number;
  zoneMax?: number;
} {
  if (master.zoneMin !== null && master.zoneMax !== null)
    return {
      intensityKind: "HR_ZONE",
      zoneMin: master.zoneMin,
      zoneMax: master.zoneMax,
    };
  return { intensityKind: "NONE" };
}

export function AddPlanForm({
  date,
  masters,
  goals,
  blockers,
  revision,
  initiallyOpen = false,
  onClose,
}: {
  date: string;
  masters: MasterOption[];
  goals: GoalOption[];
  blockers: RestBlockers;
  revision: number;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [serverError, setServerError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockState[]>([blankBlock()]);
  const [blockErrors, setBlockErrors] = useState<string[]>([]);
  const initial = masters.find((m) => m.code === "EASY_RUN") ?? masters[0];
  const initialTarget = targetDefaults(
    initial ?? ({ defaultTarget: null } as MasterOption),
  );
  const initialIntensity = intensityDefaults(
    initial ?? ({ zoneMin: null, zoneMax: null } as MasterOption),
  );

  const form = useForm<FormInput, unknown, Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      runningWorkoutCode: initial?.code ?? "",
      targetKind: initialTarget.targetKind,
      distanceKm: initialTarget.distanceKm,
      durationMin: initialTarget.durationMin,
      goalId: "",
      intensityKind: initialIntensity.intensityKind,
      zoneMin: initialIntensity.zoneMin,
      zoneMax: initialIntensity.zoneMax,
      paceFast: "",
      paceSlow: "",
      effortLabel: "",
      plannedStartTime: "",
      note: "",
      removeUnlogged: false,
    },
  });
  const code = form.watch("runningWorkoutCode");
  const targetKind = form.watch("targetKind");
  const intensityKind = form.watch("intensityKind");
  const goalId = form.watch("goalId");
  const isRest = code === "REST";
  const isRace = code === "RACE_DAY";
  const goal = goals.find((g) => g.id === goalId) ?? null;

  function onWorkoutTypeChange(next: string) {
    const master = masters.find((m) => m.code === next);
    form.setValue("runningWorkoutCode", next);
    if (!master) return;
    const t = targetDefaults(master);
    form.setValue("targetKind", t.targetKind);
    form.setValue("distanceKm", t.distanceKm);
    form.setValue("durationMin", t.durationMin);
    if (master.defaultTarget?.kind === "STRUCTURED") {
      setBlocks(targetToBlocks(master.defaultTarget));
    }
    const inten = intensityDefaults(master);
    form.setValue("intensityKind", inten.intensityKind);
    form.setValue("zoneMin", inten.zoneMin);
    form.setValue("zoneMax", inten.zoneMax);
  }

  function buildIntensity(values: Values) {
    switch (values.intensityKind) {
      case "HR_ZONE":
        return {
          kind: "HR_ZONE" as const,
          zoneMin: values.zoneMin as number,
          zoneMax: values.zoneMax as number,
        };
      case "PACE":
        return {
          kind: "PACE" as const,
          fastSecPerKm: parsePaceInput(values.paceFast ?? "") as number,
          slowSecPerKm: parsePaceInput(values.paceSlow ?? "") as number,
        };
      case "EFFORT":
        return {
          kind: "EFFORT" as const,
          label: (values.effortLabel ?? "").trim(),
        };
      default:
        return { kind: "NONE" as const };
    }
  }

  async function onSubmit(values: Values) {
    setServerError(null);
    setBlockErrors([]);
    if (isRest) {
      const res = await setRestDayAction({
        date,
        note: values.note,
        removeUnlogged: values.removeUnlogged,
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
      onClose?.();
      return;
    }
    let runningTarget: RunningTarget | undefined;
    if (!isRace) {
      if (values.targetKind === "DISTANCE") {
        runningTarget = {
          kind: "DISTANCE",
          distanceM: Math.round(Number(values.distanceKm) * 1000),
        };
      } else if (values.targetKind === "DURATION") {
        runningTarget = {
          kind: "DURATION",
          durationSec: Math.round(Number(values.durationMin) * 60),
        };
      } else {
        const estimated =
          typeof values.estimatedKm === "number" &&
          !Number.isNaN(values.estimatedKm)
            ? values.estimatedKm
            : undefined;
        const parsed = parseStructuredTarget(blocks, estimated);
        if (!parsed.ok) {
          setBlockErrors(parsed.errors);
          return;
        }
        runningTarget = parsed.target;
      }
    }
    const res = await addPlanAction({
      date,
      runningWorkoutCode: values.runningWorkoutCode,
      runningTarget,
      intensityTarget: buildIntensity(values),
      goalId: isRace ? values.goalId : undefined,
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
    onClose?.();
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
      className="form-panel w-full"
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
            onChange: (e) => onWorkoutTypeChange(e.target.value),
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

      {isRest ? (
        <div className="mt-3 rounded-button border border-line p-3">
          <p className="text-base text-charcoal">
            ตั้งวันนี้เป็นวันพัก ไม่สร้างแผนวิ่ง
          </p>
          {blockers.loggedCount > 0 ? (
            <p role="alert" className="mt-2 text-base text-charcoal">
              วันนี้มีผลบันทึกแล้ว เปลี่ยนเป็นวันพักไม่ได้
            </p>
          ) : (
            blockers.unloggedCount > 0 && (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  {...form.register("removeUnlogged")}
                  className="size-5"
                />
                นำแผนที่ยังไม่บันทึกออก ({blockers.unloggedCount} รายการ)
              </label>
            )
          )}
        </div>
      ) : isRace ? (
        <div className="mt-3">
          <label className={labelCls} htmlFor={`goal-${date}`}>
            เป้าหมาย
          </label>
          {goals.length === 0 ? (
            <p className="text-base text-muted">
              ยังไม่มีเป้าหมาย{" "}
              <Link
                href="/goals"
                className="font-medium text-forest underline underline-offset-4"
              >
                สร้างเป้าหมายก่อน
              </Link>
            </p>
          ) : (
            <>
              <select
                id={`goal-${date}`}
                className={inputCls}
                {...form.register("goalId")}
              >
                <option value="">เลือกเป้าหมาย</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.eventName ?? "เป้าหมาย"} · {formatDistanceM(g.distanceM)}
                    {g.eventDate ? ` · ${g.eventDate}` : ""}
                  </option>
                ))}
              </select>
              <FieldError message={form.formState.errors.goalId?.message} />
            </>
          )}
          {goal && (
            <p className="mt-1 text-base text-muted">
              ระยะจากเป้าหมาย: {formatDistanceM(goal.distanceM)}
            </p>
          )}
        </div>
      ) : (
        <>
          <fieldset className="mt-3">
            <legend className="mb-1 text-sm font-medium text-charcoal">
              เป้าหมายหลัก
            </legend>
            <div className="flex flex-wrap gap-4">
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
              <label className="flex min-h-11 items-center gap-2 text-base">
                <input
                  type="radio"
                  value="STRUCTURED"
                  {...form.register("targetKind")}
                  className="size-5"
                />
                มีโครงสร้าง
              </label>
            </div>
          </fieldset>

          {targetKind === "DISTANCE" && (
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
          )}

          {targetKind === "DURATION" && (
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
              <FieldError
                message={form.formState.errors.durationMin?.message}
              />
            </div>
          )}

          {targetKind === "STRUCTURED" && (
            <>
              <StructuredEditor
                blocks={blocks}
                date={date}
                onChange={setBlocks}
              />
              <div className="mt-3">
                <label className={labelCls} htmlFor={`est-${date}`}>
                  ระยะรวมโดยประมาณ (km, ถ้ามี)
                </label>
                <input
                  id={`est-${date}`}
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  className={inputCls}
                  {...form.register("estimatedKm", { valueAsNumber: true })}
                />
                <FieldError
                  message={form.formState.errors.estimatedKm?.message}
                />
              </div>
            </>
          )}
        </>
      )}

      {!isRest && (
        <fieldset className="mt-3">
          <legend className="mb-1 text-sm font-medium text-charcoal">
            ความหนัก (ถ้ามี)
          </legend>
          <label className={labelCls} htmlFor={`intensity-${date}`}>
            รูปแบบความหนัก
          </label>
          <select
            id={`intensity-${date}`}
            className={inputCls}
            {...form.register("intensityKind")}
          >
            <option value="NONE">ไม่ระบุ</option>
            <option value="HR_ZONE">โซนหัวใจ</option>
            <option value="PACE">Pace</option>
            <option value="EFFORT">ความรู้สึก</option>
          </select>
          {intensityKind === "HR_ZONE" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor={`zmin-${date}`}>
                  โซนต่ำสุด
                </label>
                <select
                  id={`zmin-${date}`}
                  className={inputCls}
                  {...form.register("zoneMin", { valueAsNumber: true })}
                >
                  {[1, 2, 3, 4, 5].map((z) => (
                    <option key={z} value={z}>
                      โซน {z}
                    </option>
                  ))}
                </select>
                <FieldError message={form.formState.errors.zoneMin?.message} />
              </div>
              <div>
                <label className={labelCls} htmlFor={`zmax-${date}`}>
                  โซนสูงสุด
                </label>
                <select
                  id={`zmax-${date}`}
                  className={inputCls}
                  {...form.register("zoneMax", { valueAsNumber: true })}
                >
                  {[1, 2, 3, 4, 5].map((z) => (
                    <option key={z} value={z}>
                      โซน {z}
                    </option>
                  ))}
                </select>
                <FieldError message={form.formState.errors.zoneMax?.message} />
              </div>
            </div>
          )}
          {intensityKind === "PACE" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor={`pacefast-${date}`}>
                  Pace เร็ว (m:ss)
                </label>
                <input
                  id={`pacefast-${date}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="6:40"
                  className={inputCls}
                  {...form.register("paceFast")}
                />
                <FieldError message={form.formState.errors.paceFast?.message} />
              </div>
              <div>
                <label className={labelCls} htmlFor={`paceslow-${date}`}>
                  Pace ช้า (m:ss)
                </label>
                <input
                  id={`paceslow-${date}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="7:30"
                  className={inputCls}
                  {...form.register("paceSlow")}
                />
                <FieldError message={form.formState.errors.paceSlow?.message} />
              </div>
            </div>
          )}
          {intensityKind === "EFFORT" && (
            <div className="mt-2">
              <label className={labelCls} htmlFor={`effort-${date}`}>
                ระดับความหนัก
              </label>
              <input
                id={`effort-${date}`}
                type="text"
                placeholder="เช่น สบาย, หนัก"
                className={inputCls}
                {...form.register("effortLabel")}
              />
              <FieldError
                message={form.formState.errors.effortLabel?.message}
              />
            </div>
          )}
        </fieldset>
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
        <FieldError message={form.formState.errors.plannedStartTime?.message} />
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

      {blockErrors.length > 0 && (
        <div role="alert" className="mt-3 text-base text-charcoal">
          <ul className="list-disc space-y-1 pl-5">
            {blockErrors.map((e) => (
              <li key={e}>{e}</li>
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
        <Button
          type="submit"
          disabled={
            form.formState.isSubmitting || (isRest && blockers.loggedCount > 0)
          }
        >
          {form.formState.isSubmitting
            ? "กำลังบันทึก…"
            : isRest
              ? "ตั้งวันพัก"
              : "เพิ่มแผน"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
          disabled={form.formState.isSubmitting}
        >
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
