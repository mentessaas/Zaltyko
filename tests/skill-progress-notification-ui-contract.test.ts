import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("skill progress notification UI contract", () => {
  it("labels and routes shared progress notifications", () => {
    const center = readFileSync("src/components/notifications/NotificationCenter.tsx", "utf8");
    const route = readFileSync("src/app/api/athlete-skills/route.ts", "utf8");
    expect(center).toContain('skill_progress: "Progreso técnico"');
    expect(center).toContain('notification.type === "skill_progress"');
    expect(center).toContain("/progress");
    expect(route).toContain("academyId: athlete.academyId");
  });
});
