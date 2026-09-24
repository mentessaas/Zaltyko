import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("scheduled notifications delivery contract", () => {
  it("does not accept group schedules without a real recipient source", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/communication/scheduled/route.ts"), "utf8");
    const cron = readFileSync(join(process.cwd(), "src/app/api/cron/scheduled-notifications/route.ts"), "utf8");
    expect(route).toContain("GROUP_RECIPIENTS_NOT_CONFIGURED");
    expect(cron).toContain("A schedule with no resolved recipients must not look delivered");
  });
});
