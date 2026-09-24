import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("session to technical progress navigation", () => {
  it("offers a direct athlete-level handoff from attendance", () => {
    const form = readFileSync("src/components/sessions/SessionAttendanceForm.tsx", "utf8");
    const page = readFileSync("src/app/dashboard/sessions/[sessionId]/page.tsx", "utf8");
    expect(form).toContain("Ver dominio técnico");
    expect(form).toContain("/progress");
    expect(page).toContain("academyId={sessionRow.academyId}");
  });
});
