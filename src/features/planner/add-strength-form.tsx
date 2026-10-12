"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { addStrengthPlanAction } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import type {
  CountMode,
  MuscleGroup,
  StrengthPrescription,
} from "@/lib/domain/master";
import { PLANNED_START_TIME_PATTERN } from "@/lib/domain/plan";
import { COUNT_MODE_TH, MUSCLE_GROUP_TH } from "@/lib/format";

export type ExerciseOption = {
  code: string;
  nameTh: string;
  nameEn: string;
  muscleGroup: MuscleGroup;
  repLabel: "REPS" | "STEPS";
  defaultVariant: string;
  defaultPrescription: StrengthPrescription;
  guidance: string;
  hint: string | null;
};

type RowState = {
  key: string;
  code: string;
  sets: string;
  dose: string;
  countMode: CountMode;
  loadKg: string;
  restSec: string;
};

const MUSCLE_ORDER: MuscleGroup[] = [
  "SINGLE_LEG",
  "GLUTES_HIPS",
  "CALVES_ANKLES",
  "CORE",
  "UPPER_BODY",
];

const TIME_MODES: CountMode[] = ["TOTAL", "PER_SIDE"];
const REPS_MODES: CountMode[] = [
  "TOTAL",
  "PER_SIDE",
  "TOTAL_ALTERNATING",
  "PER_DIRECTION",
];

let nextKey = 1;
function newKey(): string {
  nextKey += 1;
  return `ex-${Date.now()}-${nextKey}`;
}

function rowFromMaster(master: ExerciseOption): RowState {
  const p = master.defaultPrescription;
  return {
    key: newKey(),
    code: master.code,
    sets: String(p.sets),
    dose: p.measurement === "REPS" ? String(p.reps) : String(p.durationSec),
    countMode: p.countMode,
    loadKg: p.loadKg === null ? "" : String(p.loadKg),
    restSec: p.restSec === undefined ? "" : String(p.restSec),
  };
}

function parseCount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validateRow(
  row: RowState,
  master: ExerciseOption,
  index: number,
): string[] {
  const where = `ท่าที่ ${index + 1}`;
  const errors: string[] = [];
  const sets = parseCount(row.sets);
  if (sets === null || !Number.isInteger(sets)) {
    errors.push(`${where}: เซ็ตต้องเป็นจำนวนเต็มมากกว่า 0`);
  }
  const isTime = master.defaultPrescription.measurement === "TIME";
  const dose = parseCount(row.dose);
  if (isTime) {
    if (dose === null) errors.push(`${where}: วินาทีต้องมากกว่า 0`);
    if (!TIME_MODES.includes(row.countMode)) {
      errors.push(`${where}: ท่าจับเวลาเลือกได้เฉพาะรวมนับเดียวหรือต่อข้าง`);
    }
  } else {
    if (dose === null || !Number.isInteger(dose)) {
      errors.push(
        `${where}: ${master.repLabel === "STEPS" ? "ก้าว" : "ครั้ง"}ต้องเป็นจำนวนเต็มมากกว่า 0`,
      );
    }
  }
  if (row.loadKg.trim() !== "") {
    const load = Number(row.loadKg);
    if (!Number.isFinite(load) || load < 0) {
      errors.push(`${where}: น้ำหนักต้องไม่ติดลบ (ว่าง = ไม่บันทึก)`);
    }
  }
  if (row.restSec.trim() !== "" && parseCount(row.restSec) === null) {
    errors.push(`${where}: ช่วงพักต้องมากกว่า 0 วินาที`);
  }
  return errors;
}

function buildPrescription(
  row: RowState,
  master: ExerciseOption,
): StrengthPrescription {
  const sets = Number(row.sets);
  const loadKg = row.loadKg.trim() === "" ? null : Number(row.loadKg);
  const restSec = row.restSec.trim() === "" ? undefined : Number(row.restSec);
  const base = {
    sets,
    loadKg,
    ...(restSec === undefined ? {} : { restSec }),
  };
  // validateRow gates submit, so TIME rows only carry TOTAL/PER_SIDE here;
  // the server schema re-checks regardless (§11).
  return master.defaultPrescription.measurement === "TIME"
    ? {
        measurement: "TIME" as const,
        durationSec: Number(row.dose),
        countMode: row.countMode as "TOTAL" | "PER_SIDE",
        ...base,
      }
    : {
        measurement: "REPS" as const,
        reps: Number(row.dose),
        countMode: row.countMode,
        ...base,
      };
}

export function AddStrengthForm({
  date,
  exercises,
  revision,
  initiallyOpen = false,
  onClose,
}: {
  date: string;
  exercises: ExerciseOption[];
  revision: number;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [rows, setRows] = useState<RowState[]>([]);
  const [picked, setPicked] = useState(exercises[0]?.code ?? "");
  const [title, setTitle] = useState("Strength");
  const [plannedStartTime, setPlannedStartTime] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const byCode = new Map(exercises.map((m) => [m.code, m]));

  function addPicked() {
    const master = byCode.get(picked);
    if (!master) return;
    // Same exercise may repeat (circuits, §5).
    setRows((prev) => [...prev, rowFromMaster(master)]);
  }

  function patchRow(key: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function moveRow(key: string, dir: -1 | 1) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(i, 1);
      if (!row) return prev;
      next.splice(j, 0, row);
      return next;
    });
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (rows.length === 0) {
      setErrors(["เพิ่มอย่างน้อยหนึ่งท่า"]);
      return;
    }
    const issues: string[] = [];
    for (const [i, row] of rows.entries()) {
      const master = byCode.get(row.code);
      if (!master) {
        issues.push(`ท่าที่ ${i + 1}: ไม่พบท่าที่เลือก`);
        continue;
      }
      issues.push(...validateRow(row, master, i));
    }
    if (
      plannedStartTime !== "" &&
      !PLANNED_START_TIME_PATTERN.test(plannedStartTime)
    ) {
      issues.push("เวลาแบบ 06:30");
    }
    if (issues.length > 0) {
      setErrors(issues);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const res = await addStrengthPlanAction({
        date,
        title,
        exercises: rows.map((row) => {
          const master = byCode.get(row.code);
          if (!master) throw new Error("missing master");
          return {
            exerciseCode: row.code,
            variant: master.defaultVariant,
            prescription: buildPrescription(row, master),
          };
        }),
        plannedStartTime,
        note,
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
      setRows([]);
      setNote("");
      setOpen(false);
      onClose?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`เพิ่ม Strength วันที่ ${date}`}
      >
        เพิ่ม Strength
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="form-panel w-full"
      aria-label={`ฟอร์มเพิ่ม Strength วันที่ ${date}`}
    >
      <div>
        <label className={labelCls} htmlFor={`stitle-${date}`}>
          ชื่อเซสชัน
        </label>
        <input
          id={`stitle-${date}`}
          type="text"
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`spick-${date}`}>
          เลือกท่า
        </label>
        <div className="flex gap-2">
          <select
            id={`spick-${date}`}
            className={`${inputCls} flex-1`}
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            {MUSCLE_ORDER.map((g) => {
              const group = exercises.filter((m) => m.muscleGroup === g);
              if (group.length === 0) return null;
              return (
                <optgroup key={g} label={MUSCLE_GROUP_TH[g]}>
                  {group.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.nameTh}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <Button type="button" variant="outline" onClick={addPicked}>
            เพิ่มท่า
          </Button>
        </div>
      </div>

      <ol className="mt-3 space-y-3">
        {rows.map((row, i) => {
          const master = byCode.get(row.code);
          if (!master) return null;
          const isTime = master.defaultPrescription.measurement === "TIME";
          const where = `ท่าที่ ${i + 1}`;
          const id = `${date}-${row.key}`;
          const modes = isTime ? TIME_MODES : REPS_MODES;
          return (
            <li key={row.key} className="rounded-button border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">
                    {i + 1}. {master.nameTh}
                  </p>
                  <p className="text-sm text-muted">
                    {master.guidance}
                    {master.hint ? ` · ${master.hint}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-11 shrink-0 items-center text-base font-medium text-forest underline underline-offset-4"
                  onClick={() => removeRow(row.key)}
                  aria-label={`เอาท่า${master.nameTh}ออก`}
                >
                  เอาออก
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls} htmlFor={`sets-${id}`}>
                    เซ็ต{where}
                  </label>
                  <input
                    id={`sets-${id}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                    value={row.sets}
                    onChange={(e) =>
                      patchRow(row.key, { sets: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`dose-${id}`}>
                    {isTime
                      ? "วินาที"
                      : master.repLabel === "STEPS"
                        ? "ก้าว"
                        : "ครั้ง"}
                    {where}
                  </label>
                  <input
                    id={`dose-${id}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                    value={row.dose}
                    onChange={(e) =>
                      patchRow(row.key, { dose: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`mode-${id}`}>
                    การนับ{where}
                  </label>
                  <select
                    id={`mode-${id}`}
                    className={inputCls}
                    value={row.countMode}
                    onChange={(e) =>
                      patchRow(row.key, {
                        countMode: e.target.value as CountMode,
                      })
                    }
                  >
                    {modes.map((m) => (
                      <option key={m} value={m}>
                        {COUNT_MODE_TH[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls} htmlFor={`load-${id}`}>
                    น้ำหนัก (kg){where}
                  </label>
                  <input
                    id={`load-${id}`}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    className={inputCls}
                    placeholder="ว่าง = ไม่บันทึก"
                    value={row.loadKg}
                    onChange={(e) =>
                      patchRow(row.key, { loadKg: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`rest-${id}`}>
                    พัก (วิ){where}
                  </label>
                  <input
                    id={`rest-${id}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                    value={row.restSec}
                    onChange={(e) =>
                      patchRow(row.key, { restSec: e.target.value })
                    }
                  />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted">
                0 = น้ำหนักตัว · ช่วงพักว่างได้
              </p>
              <div className="mt-1 flex gap-4">
                <button
                  type="button"
                  disabled={i === 0}
                  className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4 disabled:no-underline disabled:opacity-40"
                  onClick={() => moveRow(row.key, -1)}
                  aria-label={`เลื่อน${master.nameTh}ขึ้น`}
                >
                  เลื่อนขึ้น
                </button>
                <button
                  type="button"
                  disabled={i === rows.length - 1}
                  className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4 disabled:no-underline disabled:opacity-40"
                  onClick={() => moveRow(row.key, 1)}
                  aria-label={`เลื่อน${master.nameTh}ลง`}
                >
                  เลื่อนลง
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`stime-${date}`}>
          เวลาเริ่ม (ถ้ามี)
        </label>
        <input
          id={`stime-${date}`}
          type="text"
          inputMode="numeric"
          placeholder="06:30"
          className={inputCls}
          value={plannedStartTime}
          onChange={(e) => setPlannedStartTime(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`snote-${date}`}>
          หมายเหตุ
        </label>
        <input
          id={`snote-${date}`}
          type="text"
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mt-3 text-base text-charcoal">
          <ul className="list-disc space-y-1 pl-5">
            {errors.map((e) => (
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

      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก…" : "เพิ่มแผน Strength"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(false);
            onClose?.();
            setErrors([]);
            setServerError(null);
          }}
        >
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}
