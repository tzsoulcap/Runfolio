import { describe, expect, it } from "vitest";
import { RUNNING_MASTERS } from "@/lib/db/seed-data";
import { formatStructuredDetail, formatStructuredMain, formatTargetFullTh, formatTargetTh } from "@/lib/format";
import type { RunningTarget } from "@/lib/domain/master";

describe("structured plan descriptions", () => {
  it.each([[45,"45 วินาที"],[90,"1 นาที 30 วินาที"],[120,"2 นาที"],[1200,"20 นาที"]])("keeps the configured %s seconds readable without rounding the duration", (durationSec, expected) => {
    expect(formatTargetTh({kind:"DURATION",durationSec:Number(durationSec)})).toBe(expected);
  });
  it("describes all configured Tempo steps instead of showing Structured", () => {
    const tempo = RUNNING_MASTERS.find(master => master.code === "TEMPO")!;
    const description = formatTargetTh(tempo.defaultTarget);
    expect(description).not.toContain("Structured");
    expect(description).toContain("5 km");
    expect(description.match(/2 km/g)).toHaveLength(2);
    expect(description).toContain("ปลาย Z3–Z4");
  });

  it("keeps the Tempo headline compact while showing its warmup and cooldown", () => {
    const tempo = RUNNING_MASTERS.find(master => master.code === "TEMPO")!;
    expect(formatStructuredMain(tempo.defaultTarget)).toBe("5 km");
    expect(formatStructuredDetail(tempo.defaultTarget)).toContain("วอร์มอัป 2 km");
    expect(formatStructuredDetail(tempo.defaultTarget)).toContain("คูลดาวน์ 2 km");
  });

  it("describes all blocks, repetitions, intensities and the last recovery policy", () => {
    const target: RunningTarget = { kind: "STRUCTURED", steps: [
      { kind: "STEP", phase: "WARMUP", target: {kind:"DURATION",durationSec:600}, intensity:{kind:"HR_ZONE",zoneMin:1,zoneMax:2} },
      { kind: "REPEAT", repeatCount:3, includeFinalRecovery:false, steps:[
        { kind: "STEP", phase: "WORK", target:{kind:"DISTANCE",distanceM:1000}, intensity:{kind:"PACE",fastSecPerKm:359.9,slowSecPerKm:360}, note:"คุมจังหวะ" },
        { kind: "STEP", phase: "RECOVERY", target:{kind:"OPEN",instruction:"เดินจนหายเหนื่อย"}, intensity:{kind:"EFFORT",label:"เบา"} },
      ] },
      { kind: "STEP", phase: "COOLDOWN", target:{kind:"DISTANCE",distanceM:2000}, intensity:{kind:"NONE"} },
    ] };
    const description = formatTargetFullTh(target)!;
    for (const text of ["วอร์มอัป 10 นาที", "Zone 1–2", "3 รอบ", "ช่วงหลัก 1 km", "Pace 5:59–6:00", "คุมจังหวะ", "เดินจนหายเหนื่อย", "เบา", "รอบสุดท้ายไม่พัก", "คูลดาวน์ 2 km"]) {
      expect(description).toContain(text);
    }
    expect(formatTargetFullTh(null)).toBeNull();
  });
});
