import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

describe("dashboard plan usage copy contract", () => {
  it("uses academy terminology instead of hardcoded generic nouns", () => {
    const planUsage = readFileSync(resolve(root, "src/components/dashboard/PlanUsage.tsx"), "utf8");
    const sections = readFileSync(resolve(root, "src/components/dashboard/DashboardSections.tsx"), "utf8");

    expect(planUsage).toContain("athleteLabel: string");
    expect(planUsage).toContain("classLabel: string");
    expect(planUsage).not.toContain("atletas`");
    expect(planUsage).not.toContain("clases`");
    expect(sections).toContain("athleteLabel={labels.athletesPlural.toLowerCase()}");
    expect(sections).toContain("classLabel={pluralizeFirstWord(labels.classLabel).toLowerCase()}");
  });

  it("keeps the plan upgrade action readable in dark mode", () => {
    const planUsage = readFileSync(resolve(root, "src/components/dashboard/PlanUsage.tsx"), "utf8");

    expect(planUsage).toContain("dark:text-zaltyko-electric");
    expect(planUsage).toContain("dark:border-zaltyko-electric/35");
  });
});
