import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("scheduled communication validation", () => {
  it("rejects past schedules and schedules without a template", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/communication/scheduled/route.ts"),
      "utf8",
    );
    expect(route).toContain("La fecha programada debe estar en el futuro");
    expect(route).toContain("Selecciona una plantilla para programar el envío");
  });
});
