import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/attendance/AttendanceSheet.tsx",
  "src/components/billing/BillingPanel.tsx",
  "src/components/billing/StudentChargesTab.tsx",
  "src/components/classes/ClassesTableView.tsx",
  "src/components/coach/CoachSessionWorkspace.tsx",
  "src/components/navigation/MobileAcademyNav.tsx",
  "src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx",
];

describe("operational surfaces theme contract", () => {
  it("does not ship hardcoded white/navy surfaces in academy operations", () => {
    for (const file of files) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/(?:bg|hover:bg|disabled:bg)-zaltyko-white|text-zaltyko-navy/);
    }
  });
});
