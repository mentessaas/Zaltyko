import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/api/assessments/videos/route.ts", import.meta.url), "utf8");

describe("assessment videos API P0 contract", () => {
  it("expone la operación de subida autenticada", () => {
    expect(source).toMatch(/export const POST/);
    expect(source).toMatch(/withTenant/);
  });

  it("valida tamaño y tipo/contenido del archivo", () => {
    expect(source).toMatch(/VIDEO_UPLOADS|FILE_TOO_LARGE/);
    expect(source).toMatch(/contentType|file\.type|mime/i);
    expect(source).toMatch(/validateUpload|signature|bytes|arrayBuffer/i);
  });

  it("devuelve errores estandarizados en rutas negativas", () => {
    expect(source).toMatch(/apiError/);
    expect(source).toMatch(/400|413|415/);
  });
});
