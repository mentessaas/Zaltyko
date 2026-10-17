import { describe, expect, it, vi } from "vitest";

import { inspectLegacyAcademySchema } from "@/lib/auth/legacy-academy-access";

function resultRow(
  profiles: boolean,
  academies: boolean,
  memberships: boolean
) {
  return {
    rows: [
      {
        profiles_present: profiles,
        academies_present: academies,
        memberships_present: memberships,
      },
    ],
  };
}

describe("inspección fija del esquema legacy", () => {
  it("trata las tres tablas ausentes como entorno canónico aislado", async () => {
    const execute = vi.fn(async () => resultRow(false, false, false));

    await expect(inspectLegacyAcademySchema(execute)).resolves.toBe("absent");
  });

  it("permite la consulta legacy solo cuando están presentes las tres tablas", async () => {
    const execute = vi.fn(async () => resultRow(true, true, true));

    await expect(inspectLegacyAcademySchema(execute)).resolves.toBe("present");
  });

  it("falla cerrado ante un esquema parcial, respuesta vacía o error de catálogo", async () => {
    await expect(
      inspectLegacyAcademySchema(
        vi.fn(async () => resultRow(true, false, true))
      )
    ).rejects.toThrow("está incompleto");

    await expect(
      inspectLegacyAcademySchema(vi.fn(async () => ({ rows: [] })))
    ).rejects.toThrow("No se pudo verificar");

    await expect(
      inspectLegacyAcademySchema(
        vi.fn(async () => {
          throw new Error("catalog permission denied");
        })
      )
    ).rejects.toThrow("catalog permission denied");
  });

  it("rechaza filas múltiples y valores de catálogo que no sean booleanos", async () => {
    await expect(
      inspectLegacyAcademySchema(
        vi.fn(async () => ({
          rows: [
            {
              profiles_present: false,
              academies_present: false,
              memberships_present: false,
            },
            {
              profiles_present: false,
              academies_present: false,
              memberships_present: false,
            },
          ],
        }))
      )
    ).rejects.toThrow("No se pudo verificar");

    await expect(
      inspectLegacyAcademySchema(
        vi.fn(async () => ({
          rows: [
            {
              profiles_present: "false",
              academies_present: false,
              memberships_present: false,
            },
          ],
        }))
      )
    ).rejects.toThrow("No se pudo verificar");

    await expect(
      inspectLegacyAcademySchema(
        vi.fn(async () => ({
          rows: [
            {
              profiles_present: false,
              academies_present: false,
              memberships_present: null,
            },
          ],
        }))
      )
    ).rejects.toThrow("No se pudo verificar");
  });
});
