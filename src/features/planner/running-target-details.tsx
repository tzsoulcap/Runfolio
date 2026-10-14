import type { RunningStep, RunningTarget } from "@/lib/domain/master";
import { formatRunningStepTh, formatTargetTh } from "@/lib/format";

export function RunningTargetDetails({ target }: { target: RunningTarget | null }) {
  if (target?.kind !== "STRUCTURED") return <p>{formatTargetTh(target)}</p>;
  const step = (value: RunningStep) => <p className="break-words leading-relaxed">{formatRunningStepTh(value)}</p>;
  return (
    <ol className="list-decimal space-y-3 pl-5 marker:font-medium marker:text-forest">
      {target.steps.map((block, index) => (
        <li key={index} className="pl-1">
          {block.kind === "STEP" ? step(block) : <>
            <p className="font-semibold text-charcoal">ทำซ้ำ {block.repeatCount} รอบ</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {block.steps.map((value, stepIndex) => <li key={stepIndex}>{step(value)}</li>)}
            </ol>
            <p className="mt-1 text-xs">{block.includeFinalRecovery ? "พักหลังรอบสุดท้ายด้วย" : "รอบสุดท้ายไม่พัก"}</p>
          </>}
        </li>
      ))}
    </ol>
  );
}
