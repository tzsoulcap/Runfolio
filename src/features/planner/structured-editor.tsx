"use client";

import type {
  IntensityTarget,
  RunningStep,
  RunningTarget,
  StepTarget,
} from "@/lib/domain/master";
import { RunningTargetSchema } from "@/lib/domain/master";

export type Phase = RunningStep["phase"];

export const PHASES: Array<{ value: Phase; label: string }> = [
  { value: "WARMUP", label: "อบอุ่นร่างกาย" },
  { value: "WORK", label: "งานหลัก" },
  { value: "RECOVERY", label: "พัก" },
  { value: "COOLDOWN", label: "ผ่อนคลาย" },
  { value: "STRIDES", label: "สไตรด์" },
];

export type StepState = {
  key: string;
  phase: Phase;
  targetKind: "DISTANCE" | "DURATION" | "OPEN";
  distanceM: string;
  durationSec: string;
  instruction: string;
  note: string;
  // Carried through the draft so a no-touch default round-trips losslessly
  // (§5 step 2). No per-step editor in T05; new steps default to NONE.
  intensity: IntensityTarget;
};

export type BlockState =
  | ({ key: string; kind: "STEP" } & Omit<StepState, "key">)
  | {
      key: string;
      kind: "REPEAT";
      repeatCount: string;
      includeFinalRecovery: boolean;
      steps: StepState[];
    };

let nextKey = 1;
export function newKey(): string {
  nextKey += 1;
  return `blk-${Date.now()}-${nextKey}`;
}

export function blankStep(phase: Phase = "WORK"): StepState {
  return {
    key: newKey(),
    phase,
    targetKind: "DISTANCE",
    distanceM: "",
    durationSec: "",
    instruction: "",
    note: "",
    intensity: { kind: "NONE" },
  };
}

export function blankBlock(): BlockState {
  const { key, ...rest } = blankStep();
  return { key, kind: "STEP", ...rest };
}

export function blankRepeat(): BlockState {
  return {
    key: newKey(),
    kind: "REPEAT",
    repeatCount: "",
    includeFinalRecovery: true,
    steps: [blankStep("WORK"), blankStep("RECOVERY")],
  };
}

function stepTargetToState(
  target: StepTarget,
): Pick<StepState, "targetKind" | "distanceM" | "durationSec" | "instruction"> {
  if (target.kind === "DISTANCE")
    return {
      targetKind: "DISTANCE",
      distanceM: String(target.distanceM),
      durationSec: "",
      instruction: "",
    };
  if (target.kind === "DURATION")
    return {
      targetKind: "DURATION",
      distanceM: "",
      durationSec: String(target.durationSec),
      instruction: "",
    };
  return {
    targetKind: "OPEN",
    distanceM: "",
    durationSec: "",
    instruction: target.instruction,
  };
}

// Master defaults load as an editable draft (§5 step 2).
export function targetToBlocks(target: RunningTarget | null): BlockState[] {
  if (target?.kind !== "STRUCTURED") return [blankBlock()];
  return target.steps.map((block): BlockState => {
    if (block.kind === "STEP") {
      return { key: newKey(), kind: "STEP", phase: block.phase, note: block.note ?? "", intensity: block.intensity, ...stepTargetToState(block.target) };
    }
    return {
      key: newKey(),
      kind: "REPEAT",
      repeatCount: String(block.repeatCount),
      includeFinalRecovery: block.includeFinalRecovery,
      steps: block.steps.map(
        (s): StepState => ({
          key: newKey(),
          phase: s.phase,
          note: s.note ?? "",
          intensity: s.intensity,
          ...stepTargetToState(s.target),
        }),
      ),
    };
  });
}

function parsePositive(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Thai pre-validation for every reachable case; the canonical schema stays
// the final gate (server re-validates too, §11).
export function validateBlocks(blocks: BlockState[]): string[] {
  const errors: string[] = [];
  if (blocks.length === 0) {
    errors.push("เพิ่มอย่างน้อยหนึ่งขั้นตอน");
    return errors;
  }
  const checkStep = (s: StepState, where: string) => {
    if (s.targetKind === "DISTANCE" && parsePositive(s.distanceM) === null)
      errors.push(`${where}: ระยะต้องมากกว่า 0 เมตร`);
    if (s.targetKind === "DURATION" && parsePositive(s.durationSec) === null)
      errors.push(`${where}: เวลาต้องมากกว่า 0 วินาที`);
    if (s.targetKind === "OPEN" && s.instruction.trim() === "")
      errors.push(`${where}: ใส่คำอธิบายช่วงอิสระ`);
  };
  blocks.forEach((b, i) => {
    const where = `บล็อกที่ ${i + 1}`;
    if (b.kind === "STEP") {
      checkStep(b, where);
      return;
    }
    const count = parsePositive(b.repeatCount);
    if (count === null || !Number.isInteger(count))
      errors.push(`${where}: จำนวนรอบต้องเป็นจำนวนเต็มมากกว่า 0`);
    if (b.steps.length === 0) errors.push(`${where}: รอบซ้ำต้องมีขั้นตอน`);
    b.steps.forEach((s, j) => checkStep(s, `${where} ขั้นที่ ${j + 1}`));
    const last = b.steps[b.steps.length - 1];
    if (!b.includeFinalRecovery && last && last.phase !== "RECOVERY")
      errors.push(
        `${where}: ไม่พักหลังรอบท้ายได้เฉพาะเมื่อขั้นสุดท้ายเป็นช่วงพัก`,
      );
  });
  return errors;
}

function buildStepTarget(s: StepState): StepTarget {
  if (s.targetKind === "DISTANCE")
    return { kind: "DISTANCE", distanceM: Number(s.distanceM) };
  if (s.targetKind === "DURATION")
    return { kind: "DURATION", durationSec: Number(s.durationSec) };
  return { kind: "OPEN", instruction: s.instruction.trim() };
}

function buildStep(s: StepState): RunningStep {
  return {
    kind: "STEP",
    phase: s.phase,
    target: buildStepTarget(s),
    // No per-step editor in T05, but the draft value round-trips so master
    // defaults (e.g. INTERVAL "Jog recovery") survive a no-touch save.
    intensity: s.intensity,
    ...(s.note.trim() ? { note: s.note.trim() } : {}),
  };
}

export function buildStructuredTarget(
  blocks: BlockState[],
  estimatedKm?: number,
): RunningTarget {
  return {
    kind: "STRUCTURED",
    steps: blocks.map((b) =>
      b.kind === "STEP"
        ? buildStep(b)
        : {
            kind: "REPEAT" as const,
            repeatCount: Number(b.repeatCount),
            includeFinalRecovery: b.includeFinalRecovery,
            steps: b.steps.map(buildStep),
          },
    ),
    ...(estimatedKm && estimatedKm > 0
      ? { estimatedTotalDistanceM: Math.round(estimatedKm * 1000) }
      : {}),
  };
}

export function parseStructuredTarget(
  blocks: BlockState[],
  estimatedKm?: number,
): { ok: true; target: RunningTarget } | { ok: false; errors: string[] } {
  const errors = validateBlocks(blocks);
  if (errors.length > 0) return { ok: false, errors };
  const parsed = RunningTargetSchema.safeParse(
    buildStructuredTarget(blocks, estimatedKm),
  );
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  return { ok: true, target: parsed.data };
}

function StepFields({
  step,
  where,
  date,
  onPatch,
  onDelete,
}: {
  step: StepState;
  where: string;
  date: string;
  onPatch: (patch: Partial<StepState>) => void;
  onDelete: () => void;
}) {
  const id = `${date}-${step.key}`;
  return (
    <div className="rounded-button border border-line p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`phase-${id}`}
          >
            ช่วง{where}
          </label>
          <select
            id={`phase-${id}`}
            className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
            value={step.phase}
            onChange={(e) => onPatch({ phase: e.target.value as Phase })}
          >
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`tkind-${id}`}
          >
            เป้าหมายขั้น{where}
          </label>
          <select
            id={`tkind-${id}`}
            className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
            value={step.targetKind}
            onChange={(e) =>
              onPatch({
                targetKind: e.target.value as StepState["targetKind"],
              })
            }
          >
            <option value="DISTANCE">ระยะทาง</option>
            <option value="DURATION">เวลา</option>
            <option value="OPEN">อิสระ</option>
          </select>
        </div>
      </div>
      {step.targetKind === "DISTANCE" && (
        <div className="mt-2">
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`dist-${id}`}
          >
            ระยะ (เมตร){where}
          </label>
          <input
            id={`dist-${id}`}
            type="number"
            min="0"
            inputMode="numeric"
            className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
            value={step.distanceM}
            onChange={(e) => onPatch({ distanceM: e.target.value })}
          />
        </div>
      )}
      {step.targetKind === "DURATION" && (
        <div className="mt-2">
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`dur-${id}`}
          >
            เวลา (วินาที){where}
          </label>
          <input
            id={`dur-${id}`}
            type="number"
            min="0"
            inputMode="numeric"
            className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
            value={step.durationSec}
            onChange={(e) => onPatch({ durationSec: e.target.value })}
          />
        </div>
      )}
      {step.targetKind === "OPEN" && (
        <div className="mt-2">
          <label
            className="mb-1 block text-sm font-medium text-charcoal"
            htmlFor={`open-${id}`}
          >
            คำอธิบาย{where}
          </label>
          <input
            id={`open-${id}`}
            type="text"
            className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
            value={step.instruction}
            onChange={(e) => onPatch({ instruction: e.target.value })}
          />
        </div>
      )}
      <div className="mt-2">
        <label
          className="mb-1 block text-sm font-medium text-charcoal"
          htmlFor={`note-${id}`}
        >
          หมายเหตุขั้น{where}
        </label>
        <input
          id={`note-${id}`}
          type="text"
          className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
          value={step.note}
          onChange={(e) => onPatch({ note: e.target.value })}
        />
      </div>
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
        onClick={onDelete}
      >
        ลบขั้นตอน{where}
      </button>
    </div>
  );
}

export function StructuredEditor({
  blocks,
  date,
  onChange,
}: {
  blocks: BlockState[];
  date: string;
  onChange: (blocks: BlockState[]) => void;
}) {
  const patchStepBlock = (key: string, patch: Partial<StepState>) =>
    onChange(
      blocks.map((b) =>
        b.key === key && b.kind === "STEP" ? { ...b, ...patch } : b,
      ),
    );

  const patchRepeatBlock = (
    key: string,
    patch: {
      repeatCount?: string;
      includeFinalRecovery?: boolean;
      steps?: StepState[];
    },
  ) =>
    onChange(
      blocks.map((b) =>
        b.key === key && b.kind === "REPEAT" ? { ...b, ...patch } : b,
      ),
    );

  const patchStep = (blockKey: string, stepKey: string, patch: Partial<StepState>) =>
    onChange(
      blocks.map((b) =>
        b.key === blockKey && b.kind === "REPEAT"
          ? {
              ...b,
              steps: b.steps.map((s) =>
                s.key === stepKey ? { ...s, ...patch } : s,
              ),
            }
          : b,
      ),
    );

  return (
    <div className="mt-3 space-y-3">
      {blocks.map((b, i) =>
        b.kind === "STEP" ? (
          <fieldset key={b.key} aria-label={`บล็อกที่ ${i + 1}`}>
            <legend className="mb-1 text-sm font-medium text-charcoal">
              บล็อกที่ {i + 1}
            </legend>
            <StepFields
              step={b}
              where=""
              date={date}
              onPatch={(patch) => patchStepBlock(b.key, patch)}
              onDelete={() =>
                onChange(blocks.filter((x) => x.key !== b.key))
              }
            />
          </fieldset>
        ) : (
          <fieldset
            key={b.key}
            aria-label={`รอบซ้ำที่ ${i + 1}`}
            className="rounded-card border border-line p-3"
          >
            <legend className="px-1 text-sm font-medium text-charcoal">
              รอบซ้ำที่ {i + 1}
            </legend>
            <div className="grid grid-cols-2 items-end gap-2">
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-charcoal"
                  htmlFor={`count-${date}-${b.key}`}
                >
                  จำนวนรอบ
                </label>
                <input
                  id={`count-${date}-${b.key}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="h-11 w-full rounded-button border border-line bg-paper px-3 text-base"
                  value={b.repeatCount}
                  onChange={(e) =>
                    patchRepeatBlock(b.key, { repeatCount: e.target.value })
                  }
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={b.includeFinalRecovery}
                  onChange={(e) =>
                    patchRepeatBlock(b.key, {
                      includeFinalRecovery: e.target.checked,
                    })
                  }
                  className="size-5"
                />
                พักหลังรอบท้าย
              </label>
            </div>
            <div className="mt-2 space-y-2">
              {b.steps.map((s, j) => (
                <StepFields
                  key={s.key}
                  step={s}
                  where={`ขั้นที่ ${j + 1}`}
                  date={date}
                  onPatch={(patch) => patchStep(b.key, s.key, patch)}
                  onDelete={() =>
                    patchRepeatBlock(b.key, {
                      steps: b.steps.filter((x) => x.key !== s.key),
                    })
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                onClick={() =>
                  patchRepeatBlock(b.key, { steps: [...b.steps, blankStep()] })
                }
              >
                เพิ่มขั้นตอนในรอบ
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-base font-medium text-forest underline underline-offset-4"
                onClick={() => onChange(blocks.filter((x) => x.key !== b.key))}
              >
                ลบบล็อก
              </button>
            </div>
          </fieldset>
        ),
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-button border border-line bg-paper px-4 text-base"
          onClick={() => onChange([...blocks, blankBlock()])}
        >
          เพิ่มขั้นตอน
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-button border border-line bg-paper px-4 text-base"
          onClick={() => onChange([...blocks, blankRepeat()])}
        >
          เพิ่มรอบซ้ำ
        </button>
      </div>
    </div>
  );
}
