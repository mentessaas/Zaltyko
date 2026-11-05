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

  it("liga cada nueva clave al assessment y al ID de fila antes de subir", () => {
    expect(source).toContain('`assessment-videos/${canonicalAssessmentId}/${videoId}`');
    expect(source.indexOf("const videoId = crypto.randomUUID()"))
      .toBeLessThan(source.indexOf("await uploadFile(file, generatedStoragePath"));
  });

  it("no borra metadata ni Storage si la referencia almacenada no acredita la clave exacta", () => {
    expect(source).toContain("resolveAssessmentVideoStoragePath");
    expect(source).toContain('.for("update")');
    expect(source).toContain("eq(assessmentVideos.url, video.url)");
    expect(source).not.toContain("extractUploadPath");
    expect(source).toContain('"VIDEO_STORAGE_REFERENCE_UNSAFE"');
  });
});
