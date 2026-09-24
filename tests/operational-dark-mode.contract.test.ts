import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("operational dark mode contracts", () => {
  it("calendar controls and cells use theme-aware surfaces", () => {
    const source = readFileSync(join(root, "src/components/calendar/CalendarView.tsx"), "utf8");
    expect(source).not.toContain("hover:bg-zaltyko-white");
    expect(source).not.toContain("bg-zaltyko-white");
    expect(source).toContain("hover:bg-muted");
    expect(source).toContain("bg-muted/40");
  });

  it("dashboard default icon is readable in dark mode", () => {
    const source = readFileSync(join(root, "src/components/dashboard/DashboardCard.tsx"), "utf8");
    expect(source).not.toContain("bg-zaltyko-white");
    expect(source).toContain("variant === \"default\" && \"bg-muted text-foreground\"");
  });
});
