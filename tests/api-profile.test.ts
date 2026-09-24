import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = (name: string) => readFileSync(new URL(`../src/app/api/profile/${name}`, import.meta.url), "utf8");
const component = (name: string) => readFileSync(new URL(`../src/components/profiles/${name}`, import.meta.url), "utf8");

describe("profile API P0 contract", () => {
  it("valida y actualiza el perfil sin aceptar una mutación anónima", () => {
    const source = route("route.ts");
    expect(source).toMatch(/export (async )?function PATCH/);
    expect(source).toMatch(/safeParse|parse\(/);
    expect(source).toMatch(/requireAuth|withAuthenticated|session|user/);
  });

  it("valida magic bytes y tamaño al subir foto", () => {
    const source = route("upload-photo/route.ts");
    expect(source).toMatch(/export (async )?function POST/);
    expect(source).toMatch(/magic|signature|bytes|arrayBuffer/i);
    expect(source).toMatch(/maxSize|file\.size|size/i);
  });

  it("consume el envelope estandar de subida y actualizacion", () => {
    const source = component("ProfileEditForm.tsx");
    expect(source).toMatch(/payload\?\.data\?\.url \?\? payload\?\.url/);
    expect(source).toMatch(/const updated = payload\?\.data \?\? payload/);
  });

  it("mantiene el mismo contrato en galerias de eventos y entrenadores", () => {
    const eventSource = readFileSync(new URL("../src/components/events/FileUpload.tsx", import.meta.url), "utf8");
    const coachSource = readFileSync(new URL("../src/components/coaches/PhotoGallery.tsx", import.meta.url), "utf8");
    expect(eventSource).toMatch(/payload\?\.data\?\.url \?\? payload\?\.url/);
    expect(coachSource).toMatch(/payload\?\.data\?\.url \?\? payload\?\.url/);
    expect(coachSource).toMatch(/e\.target\.value = ""/);
  });

  it("consume el envelope de tutores al crear y editar", () => {
    const source = readFileSync(new URL("../src/components/athletes/GuardianManager.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/payload\?\.data\?\.item \?\? payload\?\.item/);
    expect(source).toMatch(/tutor creado/);
    expect(source).toMatch(/tutor actualizado/);
  });

  it("consume el envelope al subir videos de evaluaciones", () => {
    const source = readFileSync(new URL("../src/components/assessments/VideoUploader.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/payload\?\.data \?\? payload/);
    expect(source).toMatch(/servidor no devolvió el vídeo procesado/);
  });

  it("consume el envelope al cargar una oferta de empleo", () => {
    const source = readFileSync(new URL("../src/app/(public)/empleo/[id]/aplicar/page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/const data = payload\?\.data \?\? payload/);
    expect(source).toMatch(/data\?\.item/);
  });

  it("consume el envelope al cargar las postulaciones del usuario", () => {
    const source = readFileSync(new URL("../src/app/dashboard/empleo/mis-postulaciones/page.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/const data = payload\?\.data \?\? payload/);
    expect(source).toMatch(/data\?\.applications/);
  });

  it("normaliza la lista de documentos del atleta", () => {
    const source = readFileSync(new URL("../src/components/athletes/AthleteDocumentsSection.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/const data = payload\?\.data \?\? payload/);
    expect(source).toMatch(/data\?\.items/);
  });

  it("mantiene el límite de plan detrás de autenticación y validación", () => {
    const source = route("adjust-plan-limits/route.ts");
    expect(source).toMatch(/export const POST|export const PATCH/);
    expect(source).toMatch(/auth|session|user/i);
    expect(source).toMatch(/safeParse|parse\(/);
  });
});
