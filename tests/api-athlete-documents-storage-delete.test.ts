import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    selectedTable: "" as string,
    documentUrl: "",
    athleteFound: true,
    documentFound: true,
    deleteAllowed: true,
    lockedTables: [] as string[],
    deleteCondition: undefined as unknown,
  };
  const tables = {
    athletes: {
      tableName: "athletes",
      id: { name: "athletes.id" },
      tenantId: { name: "athletes.tenantId" },
      academyId: { name: "athletes.academyId" },
      deletedAt: { name: "athletes.deletedAt" },
    },
    athleteDocuments: {
      tableName: "athleteDocuments",
      id: { name: "athleteDocuments.id" },
      athleteId: { name: "athleteDocuments.athleteId" },
      tenantId: { name: "athleteDocuments.tenantId" },
      fileUrl: { name: "athleteDocuments.fileUrl" },
    },
  };
  const tx = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn((table: { tableName: string }) => {
          state.selectedTable = table.tableName;
          return chain;
        }),
        where: vi.fn(() => chain),
        for: vi.fn(() => {
          state.lockedTables.push(state.selectedTable);
          return chain;
        }),
        limit: vi.fn(async () => {
          if (state.selectedTable === "athletes") {
            return state.athleteFound ? [{ id: "30000000-0000-4000-8000-000000000003" }] : [];
          }
          return state.documentFound ? [{ fileUrl: state.documentUrl }] : [];
        }),
      };
      return chain;
    }),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((condition: unknown) => {
        state.deleteCondition = condition;
        return {
          returning: vi.fn(async () => state.deleteAllowed ? [{ fileUrl: state.documentUrl }] : []),
        };
      }),
      table,
    })),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const auditWrite = vi.fn();
  const deleteFile = vi.fn(async () => undefined);
  const createSignedUrl = vi.fn(async () => "https://signed.invalid/private");
  const withTransaction = vi.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx));

  return {
    state,
    tables,
    tx,
    auditWrite,
    deleteFile,
    createSignedUrl,
    withTransaction,
  };
});

vi.mock("@/db/schema", () => ({ athletes: mocks.tables.athletes }));
vi.mock("@/db/schema/athlete-documents", () => ({ athleteDocuments: mocks.tables.athleteDocuments }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/authz", () => ({ withTenant: (handler: unknown) => handler }));
vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAthleteResource: vi.fn(async () => ({
    allowed: true,
    resource: { academyId: "20000000-0000-4000-8000-000000000002" },
  })),
}));
vi.mock("@/lib/authz/audit-service", () => ({ createAuditLog: mocks.auditWrite }));
vi.mock("@/lib/db-transactions", () => ({ withTransaction: mocks.withTransaction }));
vi.mock("@/lib/limits", () => ({
  lockAcademyOperationalWrites: vi.fn(async () => undefined),
  assertAcademyOperationalWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/storage-helpers", () => ({
  createSignedUrl: mocks.createSignedUrl,
  deleteFile: mocks.deleteFile,
}));
vi.mock("@/types/athletes", () => ({ DOCUMENT_TYPES: ["identity_document"] }));
vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn(() => new Response("{}", { status: 500 })),
}));
vi.mock("@/lib/api-response", () => ({
  apiError: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ code, message }), { status, headers: { "content-type": "application/json" } }),
  apiSuccess: (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } }),
  apiCreated: (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 201, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  desc: (column: unknown) => ({ type: "desc", column }),
  eq: (column: { name: string }, value: unknown) => ({ type: "eq", column: column.name, value }),
  isNull: (column: { name: string }) => ({ type: "isNull", column: column.name }),
}));

import { DELETE } from "@/app/api/athletes/[athleteId]/documents/route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const academyId = "20000000-0000-4000-8000-000000000002";
const athleteId = "30000000-0000-4000-8000-000000000003";
const otherTenantId = "10000000-0000-4000-8000-000000000011";
const otherAcademyId = "20000000-0000-4000-8000-000000000022";
const otherAthleteId = "30000000-0000-4000-8000-000000000033";
const documentId = "60000000-0000-4000-8000-000000000006";
const context = { tenantId, profile: { role: "owner" }, params: { athleteId } };

function privatePath(scope = { tenantId, academyId, athleteId }, suffix = "file.pdf") {
  return `${scope.tenantId}/${scope.academyId}/athletes/${scope.athleteId}/documents/${suffix}`;
}

function request() {
  return new Request(`https://sandbox.invalid/api/athletes/${athleteId}/documents?documentId=${documentId}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.selectedTable = "";
  mocks.state.documentUrl = privatePath();
  mocks.state.athleteFound = true;
  mocks.state.documentFound = true;
  mocks.state.deleteAllowed = true;
  mocks.state.lockedTables = [];
  mocks.state.deleteCondition = undefined;
});

describe("DELETE documentos: referencias de Storage", () => {
  it.each([
    privatePath({ tenantId: otherTenantId, academyId, athleteId }),
    privatePath({ tenantId, academyId: otherAcademyId, athleteId }),
    privatePath({ tenantId, academyId, athleteId: otherAthleteId }),
    privatePath({ tenantId, academyId, athleteId }, "../other-athlete/private.pdf"),
    privatePath({ tenantId, academyId, athleteId }, "%2e%2e/private.pdf"),
  ])("responde 409 antes de borrar metadata, Storage o auditoría: %s", async (storedPath) => {
    mocks.state.documentUrl = storedPath;

    const response = await DELETE(request(), context as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("No se ha eliminado nada") });
    expect(mocks.tx.delete).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.auditWrite).not.toHaveBeenCalled();
  });

  it("elimina el objeto solo cuando la ruta privada exacta pertenece al atleta", async () => {
    const path = privatePath();

    const response = await DELETE(request(), context as never);

    expect(response.status).toBe(200);
    expect(mocks.state.lockedTables).toEqual(["athletes", "athleteDocuments"]);
    expect(mocks.tx.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenCalledWith(path);
  });

  it("elimina solo metadata para URLs heredadas sin convertirlas en una clave", async () => {
    mocks.state.documentUrl = "https://legacy.example.invalid/private/document.pdf";

    const response = await DELETE(request(), context as never);

    expect(response.status).toBe(200);
    expect(mocks.tx.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });
});
