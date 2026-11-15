import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("alcance de los espacios de progreso", () => {


  it("no devuelve atletas eliminados al resolver el portal familiar", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/family/scope-service.ts"),
      "utf8"
    );

    expect(source).toContain("isNull(athletes.deletedAt)");
    expect(source).toContain("lower(${familyContacts.email}) = ${parentEmail}");
  });

});
