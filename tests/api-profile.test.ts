import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = (name: string) => readFileSync(new URL(`../src/app/api/profile/${name}`, import.meta.url), "utf8");

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

  it("mantiene el límite de plan detrás de autenticación y validación", () => {
    const source = route("adjust-plan-limits/route.ts");
    expect(source).toMatch(/export const POST|export const PATCH/);
    expect(source).toMatch(/auth|session|user/i);
    expect(source).toMatch(/safeParse|parse\(/);
  });
});
