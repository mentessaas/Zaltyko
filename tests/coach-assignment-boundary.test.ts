import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Frontera ESLint de coach-assignment (O1), definida en
 * eslint.internal-boundaries.json. tests/internal-module-boundaries.test.ts ya
 * valida la definición y escanea las fuentes del repositorio para todas las
 * fronteras; aquí se comprueba con la configuración real de ESLint que las
 * formas de importación habituales quedan bloqueadas para coach-assignment/*.
 *
 * Los especificadores internos se construyen por partes para que el escaneo de
 * fuentes de internal-module-boundaries no los tome por importaciones reales.
 */

type Boundary = { name: string; dir: string; facade: string; facadeSpecifier: string; message: string };
type LintMessage = { ruleId: string | null; severity: number; message: string };
type LintEngine = {
  lintText(code: string, options: { filePath: string; warnIgnored?: boolean }): Promise<Array<{ messages: LintMessage[] }>>;
};

const boundary = (
  JSON.parse(readFileSync(join(process.cwd(), "eslint.internal-boundaries.json"), "utf8")) as { boundaries: Boundary[] }
).boundaries.find((item) => item.name === "coach-assignment");

const ALIAS = ["@", "modules", "coach-assignment", "application", "coach-assignment"].join("/");
const FROM_SCRIPTS = ["..", "src", "modules", "coach-assignment", "application", "coach-assignment"].join("/");

let engine: LintEngine;

async function messages(filePath: string, code: string) {
  const [result] = await engine.lintText(code, { filePath, warnIgnored: true });
  return result.messages.filter(
    (message) =>
      (message.ruleId === "no-restricted-imports" || message.ruleId === "no-restricted-syntax") &&
      message.message.includes(boundary!.facadeSpecifier)
  );
}

describe("frontera de coach-assignment (ESLint)", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    const { loadESLint } = (await import("eslint")) as unknown as {
      loadESLint: (options: { useFlatConfig: boolean; cwd: string }) => Promise<new (options: { cwd: string }) => LintEngine>;
    };
    const FlatESLint = await loadESLint({ useFlatConfig: true, cwd: process.cwd() });
    engine = new FlatESLint({ cwd: process.cwd() });
  }, 120_000);

  it("está registrada con su directorio y su fachada", () => {
    expect(boundary).toMatchObject({
      dir: "src/modules/coach-assignment/application/coach-assignment",
      facade: "src/modules/coach-assignment/application/coach-assignment-service.ts",
      facadeSpecifier: "@/modules/coach-assignment/application/coach-assignment-service",
    });
    expect(boundary!.message).toContain("coach-assignment/* es interno");
  });

  it.each([
    ["tests/sample-coach.test.ts", `import { x } from "${ALIAS}/storage";\nvoid x;\n`, "no-restricted-imports"],
    ["tests/sample-coach-type.test.ts", `import type { T } from "${ALIAS}/access";\nexport type R = T;\n`, "no-restricted-imports"],
    ["tests/sample-coach-dir.test.ts", `import * as internals from "${ALIAS}";\nvoid internals;\n`, "no-restricted-imports"],
    ["scripts/sample-coach.ts", `import { x } from "${FROM_SCRIPTS}/class-coaches";\nvoid x;\n`, "no-restricted-imports"],
    ["src/app/api/v1/owner/sample-coach/route.ts", `import { x } from "${ALIAS}/session-coaches";\nvoid x;\n`, "no-restricted-imports"],
    ["src/components/owner-dashboard/SampleCoach.tsx", `import { x } from "${ALIAS}/today";\nvoid x;\n`, "no-restricted-imports"],
    ["src/modules/scheduling/application/sample.ts", `import { x } from "${ALIAS}/inheritance";\nvoid x;\n`, "no-restricted-imports"],
    ["src/modules/coach-assignment/domain/sample.ts", `import { x } from "../application/coach-assignment/queries";\nvoid x;\n`, "no-restricted-imports"],
    ["tests/sample-coach-dynamic.test.ts", `export const load = () => import("${ALIAS}/storage");\n`, "no-restricted-syntax"],
    ["tests/sample-coach-mock.test.ts", `vi.mock("${ALIAS}/storage", () => ({}));\n`, "no-restricted-syntax"],
  ])("rechaza coach-assignment/* desde %s", async (filePath, code, ruleId) => {
    const found = await messages(filePath, code);
    expect(found).toHaveLength(1);
    expect(found[0].ruleId).toBe(ruleId);
    expect(found[0].severity).toBe(2);
  });

  it("permite la fachada desde fuera y los módulos internos entre sí", async () => {
    expect(
      await messages(
        "src/app/api/v1/owner/sample-coach-facade/route.ts",
        `import { setClassCoaches } from "${boundary!.facadeSpecifier}";\nvoid setClassCoaches;\n`
      )
    ).toEqual([]);
    expect(
      await messages(boundary!.facade, `export { setClassCoaches } from "./coach-assignment/class-coaches";\n`)
    ).toEqual([]);
    expect(
      await messages(`${boundary!.dir}/class-coaches.ts`, `import { classTitularIds } from "./queries";\nvoid classTitularIds;\n`)
    ).toEqual([]);
  });
});
