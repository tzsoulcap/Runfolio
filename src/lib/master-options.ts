import type {
  MuscleGroup,
  StrengthPrescription,
} from "@/lib/domain/master";
import type {
  listRunningMasters,
  listStrengthMasters,
} from "@/lib/services/planner";

// JSON-safe option lists shared by the journal pages (forms run client-side).
export type RunningMasterOption = {
  code: string;
  nameTh: string;
  nameEn: string;
};

export type StrengthMasterOption = {
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

export function toRunningOptions(
  masters: Awaited<ReturnType<typeof listRunningMasters>>,
): RunningMasterOption[] {
  return masters.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
  }));
}

export function toStrengthOptions(
  masters: Awaited<ReturnType<typeof listStrengthMasters>>,
): StrengthMasterOption[] {
  return masters.map((m) => ({
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    muscleGroup: m.muscleGroup as MuscleGroup,
    repLabel: m.repLabel as "REPS" | "STEPS",
    defaultVariant: m.defaultVariant,
    defaultPrescription: m.defaultPrescription as StrengthPrescription,
    guidance: m.guidance,
    hint: m.hint,
  }));
}
