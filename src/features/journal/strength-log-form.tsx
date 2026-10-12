"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  saveStrengthLogAction,
  updateStrengthLogAction,
} from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field";
import type { CountMode, StrengthPrescription } from "@/lib/domain/master";
import { mintKey } from "@/lib/keys";
import { SIDES_BY_COUNT_MODE } from "@/lib/domain/log";
import {
  sideTh,
  formatDateTh,
  formatPrescriptionTh,
  weekdayTh,
} from "@/lib/format";
import type { ExerciseOption } from "@/features/planner/add-strength-form";
import type { PlanItemDTO } from "@/features/planner/types";

export type PlannedLogRow = PlanItemDTO["exercises"][number];

type SlotVal = { dose: string; load: string };
type SetRow = { setNumber: number; slots: SlotVal[] };
type ExRow = {
  key: string;
  plannedExerciseId?: string;
  exerciseCode: string;
  nameTh: string;
  measurement: "REPS" | "TIME";
  countMode: CountMode;
  repLabel: "REPS" | "STEPS";
  doseUnit: string;
  planDose?: number;
  sets: SetRow[];
};

function doseUnitFor(
  measurement: "REPS" | "TIME",
  repLabel: "REPS" | "STEPS",
): string {
  if (measurement === "TIME") return "วินาที";
  return repLabel === "STEPS" ? "ก้าว" : "ครั้ง";
}

function blankSet(n: number, slotCount: number): SetRow {
  return {
    setNumber: n,
    slots: Array.from({ length: slotCount }, () => ({ dose: "", load: "" })),
  };
}

function masterByCode(
  masters: ExerciseOption[],
  code: string,
): ExerciseOption | undefined {
  return masters.find((m) => m.code === code);
}

function rowFromPlanned(p: PlannedLogRow, masters: ExerciseOption[]): ExRow {
  const master = masterByCode(masters, p.exerciseCode);
  const measurement = p.prescription.measurement;
  const repLabel = master?.repLabel ?? "REPS";
  const slotCount = SIDES_BY_COUNT_MODE[p.prescription.countMode].length;
  return {
    key: mintKey("st"),
    plannedExerciseId: p.id,
    exerciseCode: p.exerciseCode,
    nameTh: p.masterSnapshot?.nameTh ?? master?.nameTh ?? p.exerciseCode,
    measurement,
    countMode: p.prescription.countMode,
    repLabel,
    doseUnit: doseUnitFor(measurement, repLabel),
    planDose:
      measurement === "REPS" ? p.prescription.reps : p.prescription.durationSec,
    sets: Array.from({ length: p.prescription.sets }, (_, i) =>
      blankSet(i + 1, slotCount),
    ),
  };
}

function rowFromMaster(master: ExerciseOption): ExRow {
  const p = master.defaultPrescription;
  const slotCount = SIDES_BY_COUNT_MODE[p.countMode].length;
  return {
    key: mintKey("st"),
    exerciseCode: master.code,
    nameTh: master.nameTh,
    measurement: p.measurement,
    countMode: p.countMode,
    repLabel: master.repLabel,
    doseUnit: doseUnitFor(p.measurement, master.repLabel),
    sets: Array.from({ length: p.sets }, (_, i) => blankSet(i + 1, slotCount)),
  };
}

function planLoadHint(p: StrengthPrescription): string {
  if (p.loadKg === null) return "ไม่กำหนดน้ำหนัก";
  return p.loadKg === 0 ? "น้ำหนักตัว" : `${p.loadKg} kg`;
}

// Edit mode (§7): rows carry saved results; submit replaces them wholesale.
export type StrengthExerciseInitial = {
  plannedExerciseId?: string;
  exerciseCode: string;
  measurement?: "REPS" | "TIME";
  countMode?: CountMode;
  sets: Array<{
    setNumber: number;
    slots: Array<{ dose: string; load: string; side: string }>;
  }>;
};

export type StrengthLogInitial = {
  performedDate: string;
  sessionMinutes?: string;
  startTime?: string;
  outcome: "COMPLETED" | "PARTIAL";
  rpe?: string;
  feeling?: string;
  note?: string;
  exercises: StrengthExerciseInitial[];
};

function rowsFromInitial(
  initial: StrengthLogInitial,
  planned: PlannedLogRow[],
  masters: ExerciseOption[],
): ExRow[] {
  return initial.exercises.map((saved) => {
    const planRow = saved.plannedExerciseId
      ? planned.find((p) => p.id === saved.plannedExerciseId)
      : undefined;
    const master = masterByCode(masters, saved.exerciseCode);
    const measurement =
      saved.measurement ??
      planRow?.prescription.measurement ??
      master?.defaultPrescription.measurement ??
      "REPS";
    const countMode =
      saved.countMode ??
      planRow?.prescription.countMode ??
      master?.defaultPrescription.countMode ??
      "TOTAL";
    const repLabel = master?.repLabel ?? "REPS";
    const sides = SIDES_BY_COUNT_MODE[countMode] as readonly string[];
    return {
      key: mintKey("st"),
      ...(saved.plannedExerciseId
        ? { plannedExerciseId: saved.plannedExerciseId }
        : {}),
      exerciseCode: saved.exerciseCode,
      nameTh:
        planRow?.masterSnapshot?.nameTh ?? master?.nameTh ?? saved.exerciseCode,
      measurement,
      countMode,
      repLabel,
      doseUnit: doseUnitFor(measurement, repLabel),
      ...(planRow
        ? {
            planDose:
              planRow.prescription.measurement === "REPS"
                ? planRow.prescription.reps
                : planRow.prescription.durationSec,
          }
        : {}),
      sets: saved.sets.map((s) => ({
        setNumber: s.setNumber,
        slots: sides.map((side) => {
          const slot = s.slots.find((sl) => sl.side === side);
          return { dose: slot?.dose ?? "", load: slot?.load ?? "" };
        }),
      })),
    };
  });
}

export function StrengthLogForm({
  planItemId,
  planDate,
  planned,
  masters,
  today,
  edit,
  compactTrigger = false,
  triggerLabel,
}: {
  planItemId?: string;
  planDate?: string;
  planned: PlannedLogRow[];
  masters: ExerciseOption[];
  today: string;
  edit?: { logId: string; initial: StrengthLogInitial };
  compactTrigger?: boolean;
  triggerLabel?: ReactNode;
}) {
  const router = useRouter();
  const offPlan = planItemId === undefined;
  const isEdit = edit !== undefined;
  const idSuffix = isEdit ? `edit-${edit.logId}` : (planItemId ?? "offplan");
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [mutationId] = useState<string>(() => crypto.randomUUID());

  const [performedDate, setPerformedDate] = useState(
    isEdit ? edit.initial.performedDate : (planDate ?? today),
  );
  const [sessionMinutes, setSessionMinutes] = useState(
    isEdit ? (edit.initial.sessionMinutes ?? "") : "",
  );
  const [startTime, setStartTime] = useState(
    isEdit ? (edit.initial.startTime ?? "") : "",
  );
  const [outcome, setOutcome] = useState<"COMPLETED" | "PARTIAL">(
    isEdit ? edit.initial.outcome : "COMPLETED",
  );
  const [rpe, setRpe] = useState(isEdit ? (edit.initial.rpe ?? "") : "");
  const [feeling, setFeeling] = useState(
    isEdit ? (edit.initial.feeling ?? "") : "",
  );
  const [note, setNote] = useState(isEdit ? (edit.initial.note ?? "") : "");
  // Planned shapes with empty results (no autofill §6). Eager: lazy init
  // would mint fresh keys per render and break per-set confirm.
  const [rows, setRows] = useState<ExRow[]>(() =>
    isEdit
      ? rowsFromInitial(edit.initial, planned, masters)
      : planned.map((p) => rowFromPlanned(p, masters)),
  );
  const [picked, setPicked] = useState(masters[0]?.code ?? "");

  function patchSlot(
    exKey: string,
    setNumber: number,
    slotIdx: number,
    patch: Partial<SlotVal>,
  ) {
    setRows(
      rows.map((ex) =>
        ex.key !== exKey
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s) =>
                s.setNumber !== setNumber
                  ? s
                  : {
                      ...s,
                      slots: s.slots.map((sl, i) =>
                        i !== slotIdx ? sl : { ...sl, ...patch },
                      ),
                    },
              ),
            },
      ),
    );
  }

  function confirmSet(exKey: string, setNumber: number) {
    const ex = rows.find((e) => e.key === exKey);
    if (!ex?.planDose) return;
    const dose = String(ex.planDose);
    setRows(
      rows.map((e) =>
        e.key !== exKey
          ? e
          : {
              ...e,
              sets: e.sets.map((s) =>
                s.setNumber !== setNumber
                  ? s
                  : {
                      ...s,
                      slots: s.slots.map((sl) => ({ ...sl, dose })),
                    },
              ),
            },
      ),
    );
  }

  function addOffPlanRow() {
    const master = masterByCode(masters, picked);
    if (!master) return;
    setRows([...rows, rowFromMaster(master)]);
  }

  function removeRow(exKey: string) {
    setRows(rows.filter((e) => e.key !== exKey));
  }

  function addSet(exKey: string) {
    setRows(
      rows.map((e) =>
        e.key !== exKey
          ? e
          : {
              ...e,
              sets: [
                ...e.sets,
                blankSet(
                  Math.max(...e.sets.map((s) => s.setNumber), 0) + 1,
                  SIDES_BY_COUNT_MODE[e.countMode].length,
                ),
              ],
            },
      ),
    );
  }

  function removeSet(exKey: string, setNumber: number) {
    setRows(
      rows.map((e) =>
        e.key !== exKey || e.sets.length <= 1
          ? e
          : { ...e, sets: e.sets.filter((s) => s.setNumber !== setNumber) },
      ),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found: string[] = [];
    if (rows.length === 0) {
      found.push("เพิ่มท่าอย่างน้อย 1 ท่า");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(performedDate)) {
      found.push("วันที่ซ้อมจริงไม่ถูกต้อง");
    }
    if (
      startTime.trim() !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())
    ) {
      found.push("เวลาเริ่มแบบ 06:30");
    }
    let minutes: number | undefined;
    if (sessionMinutes.trim() !== "") {
      minutes = Number(sessionMinutes);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        found.push("เวลาทั้งเซสชันต้องเป็นนาทีมากกว่า 0");
      }
    }
    let rpeNum: number | undefined;
    if (rpe.trim() !== "") {
      rpeNum = Number(rpe);
      if (!Number.isInteger(rpeNum) || rpeNum < 1 || rpeNum > 10) {
        found.push("RPE 1–10");
      }
    }
    if (feeling.length > 100) found.push("ความรู้สึกยาวเกินไป");
    if (note.length > 2000) found.push("หมายเหตุยาวเกินไป");

    const payload = rows.map((ex) => {
      const sides = SIDES_BY_COUNT_MODE[ex.countMode] as readonly string[];
      return {
        ...(ex.plannedExerciseId
          ? { plannedExerciseId: ex.plannedExerciseId }
          : {}),
        exerciseCode: ex.exerciseCode,
        countMode: ex.countMode,
        sets: ex.sets.flatMap((s) =>
          sides.map((side, i) => {
            const slot = s.slots[i] ?? { dose: "", load: "" };
            const setLabel = `${ex.nameTh} เซ็ต ${s.setNumber}${sides.length > 1 ? ` ${sideTh(side)}` : ""}`;
            let result: { reps?: number; durationSec?: number } = {};
            if (slot.dose.trim() !== "") {
              const n = Number(slot.dose);
              if (!Number.isInteger(n) || n <= 0) {
                found.push(`${setLabel}: จำนวนต้องมากกว่า 0`);
              } else if (ex.measurement === "REPS") {
                result = { reps: n };
              } else {
                result = { durationSec: n };
              }
            }
            let loadKg: number | null | undefined;
            if (slot.load.trim() !== "") {
              const n = Number(slot.load);
              if (!Number.isFinite(n) || n < 0) {
                found.push(`${setLabel}: น้ำหนักต้องไม่ติดลบ`);
              } else {
                loadKg = n;
              }
            }
            return {
              setNumber: s.setNumber,
              side,
              measurement: ex.measurement,
              ...result,
              ...(loadKg !== undefined ? { loadKg } : {}),
            };
          }),
        ),
      };
    });

    const hasResult = payload.some((ex) =>
      ex.sets.some((s) => s.reps !== undefined || s.durationSec !== undefined),
    );
    if (!hasResult) {
      found.push("กรอกผลจริงอย่างน้อย 1 เซ็ต เซ็ตที่เว้นว่างไว้ถือว่าข้าม");
    }
    setIssues(found);
    if (found.length > 0) return;

    setSubmitting(true);
    try {
      const fields = {
        performedDate,
        sessionMinutes: minutes,
        startTime: startTime.trim() === "" ? undefined : startTime.trim(),
        outcome,
        rpe: rpeNum,
        feeling: feeling === "" ? undefined : feeling,
        note: note === "" ? undefined : note,
        exercises: payload,
      };
      const res = isEdit
        ? await updateStrengthLogAction({ logId: edit.logId, ...fields })
        : await saveStrengthLogAction({
            clientMutationId: mutationId,
            planItemId,
            ...fields,
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
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    if (compactTrigger) {
      return (
        <button
          type="button"
          aria-label="บันทึกเวท"
          onClick={() => setOpen(true)}
          className="absolute inset-0 rounded-button transition-colors hover:bg-forest/[0.03]"
        >
          <span className="sr-only">บันทึกเวท</span>
        </button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={
          isEdit ? "แก้ไขผลเวท" : offPlan ? "บันทึกเวทนอกแผน" : "บันทึกเวท"
        }
      >
        {triggerLabel ??
          (isEdit ? "แก้ไขผลเวท" : offPlan ? "บันทึกเวทนอกแผน" : "บันทึกเวท")}
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="form-panel col-span-full w-full"
      aria-label="ฟอร์มบันทึกเวท"
    >
      <div>
        <label className={labelCls} htmlFor={`st-performed-${idSuffix}`}>
          วันที่ซ้อมจริง
        </label>
        <input
          id={`st-performed-${idSuffix}`}
          type="date"
          max={today}
          className={inputCls}
          value={performedDate}
          onChange={(e) => setPerformedDate(e.target.value)}
        />
        {planDate && performedDate !== planDate && (
          <p className="mt-1 text-sm text-muted">
            แผนวัน{weekdayTh(planDate)}ที่ {formatDateTh(planDate)} · ทำจริงวัน
            {weekdayTh(performedDate)}ที่ {formatDateTh(performedDate)} ·
            ความสำเร็จนับกับสัปดาห์แผน ผลงานเวทนับวันที่ทำจริง
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor={`st-min-${idSuffix}`}>
            เวลาทั้งเซสชัน นาที (ถ้ามี)
          </label>
          <input
            id={`st-min-${idSuffix}`}
            type="number"
            min="0"
            inputMode="numeric"
            className={inputCls}
            value={sessionMinutes}
            onChange={(e) => setSessionMinutes(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`st-start-${idSuffix}`}>
            เวลาเริ่ม (ถ้ามี)
          </label>
          <input
            id={`st-start-${idSuffix}`}
            type="text"
            inputMode="numeric"
            placeholder="18:00"
            className={inputCls}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
      </div>

      <ol className="mt-4 space-y-4">
        {rows.map((ex, exIdx) => {
          const sides = SIDES_BY_COUNT_MODE[ex.countMode] as readonly string[];
          const plannedRow = ex.plannedExerciseId
            ? planned.find((p) => p.id === ex.plannedExerciseId)
            : undefined;
          return (
            <li key={ex.key} className="rounded-button border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">
                    ท่าที่ {exIdx + 1} · {ex.nameTh}
                  </h3>
                  {plannedRow && (
                    <p className="mt-0.5 text-sm text-muted">
                      แผน{" "}
                      {formatPrescriptionTh(
                        plannedRow.prescription,
                        ex.repLabel,
                      )}{" "}
                      · {planLoadHint(plannedRow.prescription)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(ex.key)}
                  className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                >
                  เอาท่านี้ออก
                </button>
              </div>

              <ol className="mt-2 space-y-3">
                {ex.sets.map((s) => (
                  <li key={s.setNumber}>
                    <fieldset>
                      <legend className="text-sm font-medium text-charcoal">
                        เซ็ต {s.setNumber}
                      </legend>
                      <div
                        className={`mt-1 grid gap-2 ${sides.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                      >
                        {sides.map((side, i) => (
                          <div
                            key={side}
                            className={
                              sides.length > 1
                                ? "rounded-button border border-line p-2"
                                : ""
                            }
                          >
                            {sides.length > 1 && (
                              <p className="text-sm font-medium text-charcoal">
                                {sideTh(side)}
                              </p>
                            )}
                            <label
                              className={labelCls}
                              htmlFor={`st-${idSuffix}-${ex.key}-s${s.setNumber}-${side}-dose`}
                            >
                              {sides.length > 1
                                ? `${sideTh(side)} ${ex.doseUnit}`
                                : ex.doseUnit}
                            </label>
                            <input
                              id={`st-${idSuffix}-${ex.key}-s${s.setNumber}-${side}-dose`}
                              type="number"
                              min="0"
                              inputMode="numeric"
                              className={inputCls}
                              value={s.slots[i]?.dose ?? ""}
                              onChange={(e) =>
                                patchSlot(ex.key, s.setNumber, i, {
                                  dose: e.target.value,
                                })
                              }
                            />
                            <label
                              className={labelCls}
                              htmlFor={`st-${idSuffix}-${ex.key}-s${s.setNumber}-${side}-load`}
                            >
                              น้ำหนักภายนอกรวม kg
                            </label>
                            <input
                              id={`st-${idSuffix}-${ex.key}-s${s.setNumber}-${side}-load`}
                              type="number"
                              step="0.5"
                              min="0"
                              inputMode="decimal"
                              className={inputCls}
                              value={s.slots[i]?.load ?? ""}
                              onChange={(e) =>
                                patchSlot(ex.key, s.setNumber, i, {
                                  load: e.target.value,
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4">
                        {ex.planDose !== undefined && (
                          <button
                            type="button"
                            onClick={() => confirmSet(ex.key, s.setNumber)}
                            className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                          >
                            ทำตามแผนเซ็ต {s.setNumber}
                          </button>
                        )}
                        {(!ex.plannedExerciseId || offPlan) &&
                          ex.sets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSet(ex.key, s.setNumber)}
                              className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                            >
                              เอาเซ็ต {s.setNumber} ออก
                            </button>
                          )}
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
              {(!ex.plannedExerciseId || offPlan) && (
                <button
                  type="button"
                  onClick={() => addSet(ex.key)}
                  className="mt-1 inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                >
                  เพิ่มเซ็ต
                </button>
              )}
              <p className="mt-1 text-sm text-muted">
                เซ็ตที่เว้นว่างไว้ถือว่าข้าม · ช่องน้ำหนักว่างคือไม่บันทึก ใส่ 0
                คือน้ำหนักตัว · น้ำหนักคือน้ำหนักภายนอกรวม เช่น ดัมเบลสองข้าง
                ข้างละ 5 kg เก็บ 10 kg
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`st-pick-${idSuffix}`}>
          {offPlan ? "เลือกท่า" : "เพิ่มท่านอกแผน"}
        </label>
        <div className="flex gap-2">
          <select
            id={`st-pick-${idSuffix}`}
            className={inputCls}
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            {masters.map((m) => (
              <option key={m.code} value={m.code}>
                {m.nameTh} · {m.nameEn}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" onClick={addOffPlanRow}>
            เพิ่มท่า
          </Button>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium text-charcoal">ผล</legend>
        <div className="flex gap-4">
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name={`st-outcome-${idSuffix}`}
              value="COMPLETED"
              checked={outcome === "COMPLETED"}
              onChange={() => setOutcome("COMPLETED")}
              className="size-5"
            />
            เสร็จแล้ว
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="radio"
              name={`st-outcome-${idSuffix}`}
              value="PARTIAL"
              checked={outcome === "PARTIAL"}
              onChange={() => setOutcome("PARTIAL")}
              className="size-5"
            />
            ทำบางส่วน
          </label>
        </div>
      </fieldset>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`st-rpe-${idSuffix}`}>
          RPE 1–10 (ถ้ามี)
        </label>
        <input
          id={`st-rpe-${idSuffix}`}
          type="number"
          min="1"
          max="10"
          inputMode="numeric"
          className={inputCls}
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`st-feeling-${idSuffix}`}>
          ความรู้สึก (ถ้ามี)
        </label>
        <input
          id={`st-feeling-${idSuffix}`}
          type="text"
          maxLength={100}
          className={inputCls}
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor={`st-note-${idSuffix}`}>
          หมายเหตุ
        </label>
        <input
          id={`st-note-${idSuffix}`}
          type="text"
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

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
              : "บันทึกผลเวท"}
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
