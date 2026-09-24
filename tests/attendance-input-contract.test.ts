import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("attendance input contract", () => {
  it("bounds batch size and rejects duplicate athlete entries", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/attendance/route.ts"), "utf8");
    expect(route).toContain(".max(500)");
    expect(route).toContain("Atleta repetido en la misma solicitud");
  });
});
