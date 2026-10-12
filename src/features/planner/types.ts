import type {
  RunningTarget,
  StrengthPrescription,
} from "@/lib/domain/master";
import type { DerivedPlanStatus } from "@/lib/domain/plan";
import type { DayWithItems } from "@/lib/services/planner";

// JSON-safe board data: server maps DayWithItems to these before passing to
// client components (drizzle rows carry Date objects).
export type PlanItemDTO = {
  id: string;
  dailyPlanId: string;
  activityType: string;
  title: string;
  plannedStartTime: string | null;
  note: string | null;
  sortOrder: number;
  planState: string;
  status: DerivedPlanStatus;
  runningWorkoutCode: string | null;
  runningTarget: RunningTarget | null;
  log: { id: string; outcome: string } | null;
  exercises: Array<{
    id: string;
    exerciseCode: string;
    prescription: StrengthPrescription;
    sortOrder: number;
    masterSnapshot: { nameTh?: string; repLabel?: string } | null;
  }>;
};

export type DayDTO = {
  id: string;
  date: string;
  isRestDay: boolean;
  note: string | null;
  items: PlanItemDTO[];
};

export function toDayDTO(day: DayWithItems): DayDTO {
  return {
    id: day.id,
    date: day.date,
    isRestDay: day.isRestDay,
    note: day.note,
    items: day.items.map((item) => ({
      id: item.id,
      dailyPlanId: item.dailyPlanId,
      activityType: item.activityType,
      title: item.title,
      plannedStartTime: item.plannedStartTime,
      note: item.note,
      sortOrder: item.sortOrder,
      planState: item.planState,
      status: item.status,
      runningWorkoutCode: item.runningWorkoutCode,
      runningTarget: item.runningTarget,
      log: item.log ? { id: item.log.id, outcome: item.log.outcome } : null,
      exercises: item.exercises.map((e) => ({
        id: e.id,
        exerciseCode: e.exerciseCode,
        prescription: e.prescription,
        sortOrder: e.sortOrder,
        masterSnapshot: e.masterSnapshot as PlanItemDTO["exercises"][number]["masterSnapshot"],
      })),
    })),
  };
}
