import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scanFile } from "../scripts/gates/auth-before-validate";

function scanHandler(body: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "zaltyko-auth-gate-"));
  const filePath = path.join(directory, "route.ts");
  writeFileSync(filePath, body);
  try {
    return scanFile(filePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("gate auth-before-validate", () => {
  it("reconoce authenticateSuperAdminOperator antes de validar el body", () => {
    const findings = scanHandler(`
      export async function POST(request: Request) {
        const auth = await authenticateSuperAdminOperator(request);
        if (!auth.ok) return auth.response;
        const body = await request.json();
        return Response.json(body);
      }
    `);

    expect(findings).toEqual([]);
  });

  it("sigue señalando la validación anterior a authenticateSuperAdminOperator", () => {
    const findings = scanHandler(`
      export async function POST(request: Request) {
        const body = await request.json();
        const auth = await authenticateSuperAdminOperator(request);
        if (!auth.ok) return auth.response;
        return Response.json(body);
      }
    `);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("A3/validate-before-auth");
  });
});
