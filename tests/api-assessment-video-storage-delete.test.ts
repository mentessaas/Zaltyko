import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    selectedTable: "" as string,
    lockedTables: [] as string[],
    videoUrl: "",
    videoFound: true,
    assessmentFound: true,
    deleteAllowed: true,
    deleteCondition: undefined as unknown,
    generatedPath: "",
    returnedUploadPath: null as string | null,
    uploadError: null as Error | null,
    insertError: null as Error | null,
    insertedValues: undefined as Record<string, unknown> | undefined,
  };
  const tables = {
    assessmentVideos: {
      tableName: "assessmentVideos",
      id: { name: "assessmentVideos.id" },
      assessmentId: { name: "assessmentVideos.assessmentId" },
      url: { name: "assessmentVideos.url" },
      title: { name: "assessmentVideos.title" },
    },
    athleteAssessments: {
      tableName: "athleteAssessments",
      id: { name: "athleteAssessments.id" },
      tenantId: { name: "athleteAssessments.tenantId" },
      academyId: { name: "athleteAssessments.academyId" },
      athleteId: { name: "athleteAssessments.athleteId" },
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
          if (state.selectedTable === "assessmentVideos") {
            return state.videoFound
              ? [{ id: videoId, assessmentId, url: state.videoUrl }]
              : [];
          }
          return state.assessmentFound
            ? [{ id: assessmentId, tenantId, academyId, athleteId }]
            : [];
        }),
      };
      return chain;
    }),
    delete: vi.fn(() => ({
      where: vi.fn((condition: unknown) => {
        state.deleteCondition = condition;
        return {
          returning: vi.fn(async () => state.deleteAllowed ? [{ id: videoId }] : []),
        };
      }),
    })),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const dbSelect = vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(async () => state.assessmentFound
        ? [{ id: assessmentId, tenantId, academyId, athleteId }]
        : []),
    };
    return chain;
  });
  const dbInsertValues = vi.fn(async (values: Record<string, unknown>) => {
    state.insertedValues = values;
    if (state.insertError) throw state.insertError;
    return [];
  });
  const dbInsert = vi.fn(() => ({ values: dbInsertValues }));
  const db = { select: dbSelect, insert: dbInsert, delete: vi.fn(), update: vi.fn() };
  const deleteFile = vi.fn(async () => undefined);
  const uploadFile = vi.fn(async () => {
    if (state.uploadError) throw state.uploadError;
    return {
      url: `https://project.supabase.co/storage/v1/object/public/uploads/${state.generatedPath}`,
      path: state.returnedUploadPath ?? state.generatedPath,
    };
  });
  const generateFilePath = vi.fn((tenant: string, academy: string, folder: string) => {
    state.generatedPath = `${tenant}/${academy}/${folder}/1730000000000-abcdef0123456789abcdef01.mp4`;
    return state.generatedPath;
  });
  const auditWrite = vi.fn();
  const verifyProgressAccess = vi.fn(async () => ({ allowed: true }));
  const withTransaction = vi.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx));

  return {
    state,
    tables,
    tx,
    db,
    dbInsertValues,
    deleteFile,
    uploadFile,
    generateFilePath,
    auditWrite,
    verifyProgressAccess,
    withTransaction,
  };
});

vi.mock("@/db/schema", () => ({
  assessmentVideos: mocks.tables.assessmentVideos,
  athleteAssessments: mocks.tables.athleteAssessments,
}));
vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/authz", () => ({ withTenant: (handler: unknown) => handler }));
vi.mock("@/lib/authz/audit-service", () => ({ createAuditLog: mocks.auditWrite }));
vi.mock("@/lib/db-transactions", () => ({ withTransaction: mocks.withTransaction }));
vi.mock("@/lib/supabase/storage-helpers", () => ({
  uploadFile: mocks.uploadFile,
  generateFilePath: mocks.generateFilePath,
  deleteFile: mocks.deleteFile,
}));
vi.mock("@/lib/progress/service", () => ({ verifyProgressAccess: mocks.verifyProgressAccess }));
vi.mock("@/lib/uploads/file-security", () => ({
  VIDEO_UPLOADS: { "video/mp4": { maxBytes: 50 * 1024 * 1024, extension: "mp4" } },
  validateUpload: vi.fn(() => ({ ok: true, extension: "mp4" })),
}));
vi.mock("@/lib/api-response", () => ({
  apiError: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ code, message }), { status, headers: { "content-type": "application/json" } }),
  apiSuccess: (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (column: { name: string }, value: unknown) => ({ type: "eq", column: column.name, value }),
}));

import { DELETE, POST } from "@/app/api/assessments/videos/route";

const tenantId = "10000000-0000-4000-8000-000000000001";
const academyId = "20000000-0000-4000-8000-000000000002";
const athleteId = "30000000-0000-4000-8000-000000000003";
const assessmentId = "40000000-0000-4000-8000-000000000004";
const videoId = "50000000-0000-4000-8000-000000000005";
const otherTenantId = "10000000-0000-4000-8000-000000000011";
const otherAcademyId = "20000000-0000-4000-8000-000000000022";
const otherAssessmentId = "40000000-0000-4000-8000-000000000044";
const otherVideoId = "50000000-0000-4000-8000-000000000055";
const storageOrigin = "https://project.supabase.co";
const configuredUrlBefore = process.env.NEXT_PUBLIC_SUPABASE_URL;
const context = { tenantId, profile: { role: "owner" } };
const generatedFile = "1730000000000-abcdef0123456789abcdef01.mp4";

function objectKey(overrides: Partial<{
  tenantId: string;
  academyId: string;
  assessmentId: string;
  videoId: string;
}> = {}) {
  const prefix = [
    overrides.tenantId ?? tenantId,
    overrides.academyId ?? academyId,
    "assessment-videos",
    overrides.assessmentId ?? assessmentId,
    overrides.videoId ?? videoId,
  ].join("/");
  return `${prefix}/${generatedFile}`;
}

function publicUrl(key: string, origin = storageOrigin) {
  return `${origin}/storage/v1/object/public/uploads/${key}`;
}

function deleteRequest() {
  return new Request(`https://sandbox.invalid/api/assessments/videos?id=${videoId}`, { method: "DELETE" });
}

function uploadRequest() {
  const values: Record<string, unknown> = {
    file: {
      name: "clip.mp4",
      type: "video/mp4",
      size: 8,
      arrayBuffer: async () => new ArrayBuffer(8),
    },
    academyId,
    assessmentId,
  };
  return {
    formData: async () => ({ get: (name: string) => values[name] }),
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = storageOrigin;
  mocks.state.selectedTable = "";
  mocks.state.lockedTables = [];
  mocks.state.videoUrl = publicUrl(objectKey());
  mocks.state.videoFound = true;
  mocks.state.assessmentFound = true;
  mocks.state.deleteAllowed = true;
  mocks.state.deleteCondition = undefined;
  mocks.state.generatedPath = "";
  mocks.state.returnedUploadPath = null;
  mocks.state.uploadError = null;
  mocks.state.insertError = null;
  mocks.state.insertedValues = undefined;
});

afterAll(() => {
  if (configuredUrlBefore === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = configuredUrlBefore;
});

describe("DELETE vídeos de evaluación: clave ligada a la fila", () => {
  it.each([
    publicUrl(objectKey({ tenantId: otherTenantId })),
    publicUrl(objectKey({ academyId: otherAcademyId })),
    publicUrl(objectKey({ assessmentId: otherAssessmentId })),
    publicUrl(objectKey({ videoId: otherVideoId })),
    publicUrl(objectKey(), "https://project.supabase.co.evil.invalid"),
    publicUrl(objectKey(), "https://project.supabase.co@evil.invalid"),
    `https://project.supabase.co/prefix/storage/v1/object/public/uploads/${objectKey()}`,
    `https://project.supabase.co/storage/v1/object/public/uploads.evil/${objectKey()}`,
    publicUrl([
      tenantId, academyId, "assessment-videos", "..", assessmentId, videoId, generatedFile,
    ].join("/")),
    publicUrl([
      tenantId, academyId, "assessment-videos", "%2e%2e", assessmentId, videoId, generatedFile,
    ].join("/")),
    `${publicUrl(objectKey())}?download=1`,
    "https://legacy.example.invalid/storage/v1/object/public/uploads/legacy-video.mp4",
  ])("responde 409 sin mutar DB/Storage/auditoría ante referencia insegura: %s", async (storedUrl) => {
    mocks.state.videoUrl = storedUrl;

    const response = await DELETE(deleteRequest(), context as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("No se ha eliminado nada") });
    expect(mocks.state.lockedTables).toEqual(["assessmentVideos", "athleteAssessments"]);
    expect(mocks.tx.delete).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.db.delete).not.toHaveBeenCalled();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.auditWrite).not.toHaveBeenCalled();
  });

  it("falla cerrado sin origen configurado y conserva fila/objeto", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const response = await DELETE(deleteRequest(), context as never);

    expect(response.status).toBe(409);
    expect(mocks.tx.delete).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("bloquea las filas, borra con CAS y limpia la clave exacta validada", async () => {
    mocks.state.videoUrl = publicUrl(objectKey());

    const response = await DELETE(deleteRequest(), context as never);

    expect(response.status).toBe(200);
    expect(mocks.state.lockedTables).toEqual(["assessmentVideos", "athleteAssessments"]);
    expect(mocks.tx.delete).toHaveBeenCalledOnce();
    expect(mocks.state.deleteCondition).toEqual({
      type: "and",
      conditions: [
        { type: "eq", column: "assessmentVideos.id", value: videoId },
        { type: "eq", column: "assessmentVideos.assessmentId", value: assessmentId },
        { type: "eq", column: "assessmentVideos.url", value: publicUrl(objectKey()) },
      ],
    });
    expect(mocks.deleteFile).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).toHaveBeenCalledWith(objectKey());
  });

  it("si el CAS no encuentra la fila esperada, responde 409 y no toca Storage", async () => {
    mocks.state.deleteAllowed = false;

    const response = await DELETE(deleteRequest(), context as never);

    expect(response.status).toBe(409);
    expect(mocks.tx.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });
});

describe("POST vídeos: compensación acotada", () => {
  it("crea la fila y mantiene los IDs canónicos en objeto, metadata y respuesta", async () => {
    const response = await POST(uploadRequest(), context as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    const createdVideoId = String(mocks.state.insertedValues?.id);
    const generatedPath = mocks.state.generatedPath;
    expect(generatedPath).toContain(`/assessment-videos/${assessmentId}/${createdVideoId}/`);
    expect(mocks.state.insertedValues).toMatchObject({
      id: createdVideoId,
      assessmentId,
      url: `https://project.supabase.co/storage/v1/object/public/uploads/${generatedPath}`,
    });
    expect(body.data).toMatchObject({
      id: createdVideoId,
      path: generatedPath,
      url: `https://project.supabase.co/storage/v1/object/public/uploads/${generatedPath}`,
    });
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(mocks.db.insert).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("preserva el objeto si el insert falla con resultado potencialmente ambiguo", async () => {
    mocks.state.insertError = new Error("synthetic insert failure");

    const response = await POST(uploadRequest(), context as never);

    expect(response.status).toBe(500);
    const videoIdFromInsert = String(mocks.state.insertedValues?.id);
    const generatedPath = mocks.state.generatedPath;
    expect(generatedPath).toContain(`/assessment-videos/${assessmentId}/${videoIdFromInsert}/`);
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(mocks.db.insert).toHaveBeenCalledOnce();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("no compensa una subida con resultado incierto", async () => {
    mocks.state.uploadError = new Error("synthetic upload failure");

    const response = await POST(uploadRequest(), context as never);

    expect(response.status).toBe(500);
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("conserva el objeto si la ruta devuelta no confirma la clave generada", async () => {
    mocks.state.returnedUploadPath = "different-returned-path.mp4";

    const response = await POST(uploadRequest(), context as never);

    expect(response.status).toBe(500);
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });
});
