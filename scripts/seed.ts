// Seed master data (§9). Idempotent: safe to re-run (upserts by code).
import { config } from "dotenv";

import type {
  RunningWorkoutMaster,
  StrengthExerciseMaster,
} from "@/lib/domain/master";

config({ path: ".env.local" });

function toRunningRow(m: RunningWorkoutMaster) {
  return {
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    activityType: m.activityType,
    purpose: m.purpose,
    zoneMin: m.zoneMin ?? null,
    zoneMax: m.zoneMax ?? null,
    guidance: m.guidance,
    defaultTarget: m.defaultTarget ?? null,
    hint: m.hint ?? null,
    seedVersion: m.seedVersion,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
  };
}

function toStrengthRow(m: StrengthExerciseMaster) {
  return {
    code: m.code,
    nameTh: m.nameTh,
    nameEn: m.nameEn,
    muscleGroup: m.muscleGroup,
    isUnilateral: m.isUnilateral,
    defaultVariant: m.defaultVariant,
    defaultPrescription: m.defaultPrescription,
    repLabel: m.repLabel,
    guidance: m.guidance,
    hint: m.hint ?? null,
    seedVersion: m.seedVersion,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
  };
}

// Dynamic imports: env must load before the db client module evaluates.
async function main() {
  const { db } = await import("@/lib/db/client");
  const { runningWorkoutMasters, strengthExerciseMasters } = await import(
    "@/lib/db/schema"
  );
  const { RUNNING_MASTERS, STRENGTH_MASTERS } = await import(
    "@/lib/db/seed-data"
  );
  const { count } = await import("drizzle-orm");

  for (const m of RUNNING_MASTERS) {
    const { code, ...set } = toRunningRow(m);
    await db
      .insert(runningWorkoutMasters)
      .values({ code, ...set })
      .onConflictDoUpdate({
        target: runningWorkoutMasters.code,
        set: { ...set, updatedAt: new Date() },
      });
  }

  for (const m of STRENGTH_MASTERS) {
    const { code, ...set } = toStrengthRow(m);
    await db
      .insert(strengthExerciseMasters)
      .values({ code, ...set })
      .onConflictDoUpdate({
        target: strengthExerciseMasters.code,
        set: { ...set, updatedAt: new Date() },
      });
  }

  const [running] = await db
    .select({ n: count() })
    .from(runningWorkoutMasters);
  const [strength] = await db
    .select({ n: count() })
    .from(strengthExerciseMasters);
  console.log(
    `seeded running=${running?.n} strength=${strength?.n} (expected 10/14)`,
  );
  if (running?.n !== 10 || strength?.n !== 14) {
    console.error("seed count mismatch");
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
