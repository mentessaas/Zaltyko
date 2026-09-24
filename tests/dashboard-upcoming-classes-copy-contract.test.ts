import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/dashboard/UpcomingClasses.tsx", "utf8");

describe("upcoming classes copy", () => {
  it("uses academy terminology for classes and coaches", () => {
    expect(source).toContain("pluralizeFirstWord(specialization.labels.classLabel).toLowerCase()");
    expect(source).toContain("pluralizeFirstWord(specialization.labels.coachLabel).toLowerCase()");
    expect(source).toContain("`Calendario de ${classLabelPlural}`");
    expect(source).toContain("`Sin ${coachLabelPlural}`");
    expect(source).not.toContain("\"Sin entrenador\"");
    expect(source).not.toContain("Próximas clases");
  });
});
