/**
 * O4 · Los errores de base de datos de la importación no salen con los
 * parámetros de la consulta (nombres, emails y teléfonos de menores y
 * familias): solo con el SQLSTATE. Así no llegan a los logs ni a Sentry.
 * Datos sintéticos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import {
  athleteImportPreviewToken,
  confirmAthleteImport,
  previewAthleteImport,
} from "@/modules/athlete-import/application/athlete-import-service";
import { deriveImportMapping } from "@/modules/athlete-import/domain/athlete-import-rows";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const actor = { userId, memberId: "30000000-0000-4000-8000-000000000001" };
const PERSONAL = ["Lucía", "Prueba", "marta@example.invalid", "+34600000001", "2016-03-15"];
const file = new TextEncoder().encode(
  "Nombre;Apellidos;Fecha de nacimiento;Email del tutor;Teléfono del tutor;Nombre del tutor;Apellidos del tutor\n" +
    "Lucía;Prueba;15/03/2016;marta@example.invalid;+34600000001;Marta;Prueba\n"
);

/** What Drizzle and node-postgres throw: the statement and its parameters in the message. */
function drizzleError() {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "people_pkey"'), {
    code: "23505",
    detail: "Key (given_name)=(Lucía) already exists.",
  });
  return Object.assign(
    new Error(
      'Failed query: insert into zaltyko.people (given_name, family_name) values ($1, $2)\nparams: Lucía,Prueba,marta@example.invalid,+34600000001,2016-03-15'
    ),
    { cause, query: "insert into zaltyko.people", params: PERSONAL }
  );
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("La llamada debía fallar");
    },
    (error: unknown) => error
  );
}

function expectNoPersonalData(error: unknown) {
  expect(error).toBeInstanceOf(Error);
  const failure = error as Error & Record<string, unknown>;
  expect(failure.message).toBe("La importación de gimnastas falló (SQLSTATE 23505).");
  expect(failure.cause).toBeUndefined();
  const everything = [
    failure.message,
    String(failure.stack ?? ""),
    JSON.stringify(failure),
    ...Object.getOwnPropertyNames(failure).map((key) => String(failure[key])),
  ].join("\n");
  for (const value of PERSONAL) expect(everything, value).not.toContain(value);
}

beforeEach(() => {
  mocks.transaction.mockReset();
});

describe("errores de la importación sin datos personales", () => {
  it("la vista previa relanza el error de base de datos solo con el SQLSTATE", async () => {
    mocks.transaction.mockRejectedValueOnce(drizzleError());
    expectNoPersonalData(await caught(previewAthleteImport({ organizationId, userId, actor, fileBytes: file })));
  });

  it("la confirmación relanza el error de base de datos solo con el SQLSTATE", async () => {
    mocks.transaction.mockRejectedValueOnce(drizzleError());
    const mapping = deriveImportMapping([
      "Nombre",
      "Apellidos",
      "Fecha de nacimiento",
      "Email del tutor",
      "Teléfono del tutor",
      "Nombre del tutor",
      "Apellidos del tutor",
    ]);
    const error = await caught(
      confirmAthleteImport({
        organizationId,
        userId,
        actor,
        fileBytes: file,
        mapping,
        previewToken: athleteImportPreviewToken(file, mapping, { organizationId, userId }),
        idempotencyKey: "owner-athlete-import:clave-errores",
        legalBasisConfirmed: true,
      })
    );
    expectNoPersonalData(error);
  });

  it("sin SQLSTATE dice solo que falló", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("params: Lucía,Prueba,marta@example.invalid"));
    const error = (await caught(previewAthleteImport({ organizationId, userId, actor, fileBytes: file }))) as Error;
    expect(error.message).toBe("La importación de gimnastas falló.");
  });

  it("deja pasar sin cambios los errores de negocio, que no llevan datos personales", async () => {
    const business = new OperationalError("FORBIDDEN", "Solo la propiedad o la administración…", 403);
    mocks.transaction.mockRejectedValueOnce(business);
    expect(await caught(previewAthleteImport({ organizationId, userId, actor, fileBytes: file }))).toBe(business);
  });
});
