# Running Journal

Personal training journal where the user plans their own running and strength sessions, logs what they actually did, and reviews history against plan.

## Language

**Session**:
One training bout, side-agnostic. A planned session is a PlanItem; a logged session is a Log.
_Avoid_: workout (for bouts)

**PlanItem**:
One planned session within a day: a running workout with its target, or a strength session with its exercise list.
_Avoid_: session (in code), workout, รายการซ้อม (in code; fine in Thai UI copy)

**Log**:
One actual record of training performed (entity: WorkoutLog). The "Workout" in WorkoutLog is historical; do not generalize it.
_Avoid_: session (in code), workout, ผลซ้อม (in code; fine in Thai UI copy)

**Workout type**:
One running master entry (e.g. EASY_RUN, INTERVAL): the kind of run, not an instance of training.
_Avoid_: workout (unqualified)

**Exercise**:
One strength master entry (e.g. PLANK, BULGARIAN_SPLIT_SQUAT): a named movement with a default prescription.
_Avoid_: workout, ท่า (in code; fine in Thai UI copy)

**Split**:
One measured repetition within a running log (e.g. one 800 m rep): ordered, freeform, optional detail. Splits never override session totals.
_Avoid_: rep, lap (Thai UI uses รอบ)
