import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserId: vi.fn(),
  getCurrentProfile: vi.fn(),
  rateLimit: vi.fn(),
  submit: vi.fn(),
  listNotices: vi.fn(),
  updateNotice: vi.fn(),
  erase: vi.fn(),
  listElements: vi.fn(),
  withdraw: vi.fn(),
  logAdminAction: vi.fn(),
  execute: vi.fn(),
  runCronWithLease: vi.fn(),
  eraseLeads: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute, select: vi.fn() } }));
vi.mock("@/lib/authz/user-resolver", () => ({ resolveUserId: mocks.resolveUserId }));
vi.mock("@/lib/authz/profile-service", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock("@/lib/authz/tenant-resolver", () => ({ getTenantId: vi.fn(), resolveTenantWithUpdate: vi.fn() }));
vi.mock("@/lib/authz/profile-updater", () => ({ updateProfileIfNeeded: vi.fn() }));
vi.mock("@/lib/authz/endpoint-config", () => ({
  isPublicEndpoint: vi.fn(() => false),
  isAcademyCreationEndpoint: vi.fn(() => false),
  isFlexibleTenantEndpoint: vi.fn(() => false),
  extractVerifiedAcademyCandidate: vi.fn(),
}));
vi.mock("@/lib/authz/route-permissions", () => ({ getRequiredRoutePermission: vi.fn(() => null) }));
vi.mock("@/lib/authz/permissions-service", () => ({ getUserPermissions: vi.fn() }));
vi.mock("@/lib/supabase/bearer-client", () => ({ getBearerToken: vi.fn(), createBearerSupabaseClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: vi.fn(),
  getClientIdentifier: () => "ip:203.0.113.10",
  getAddressHashRateLimitIdentifier: (_email: string, pathname: string) => `${pathname}:address:hash`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: mocks.loggerInfo },
}));
vi.mock("@/lib/admin-logs", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("@/lib/cron-lease", () => ({
  runCronWithLease: mocks.runCronWithLease,
}));
vi.mock("@/modules/element-library/application/notices", () => ({
  submitContentNotice: mocks.submit,
  listContentNotices: mocks.listNotices,
  updateContentNotice: mocks.updateNotice,
  eraseExpiredNoticeSenders: mocks.erase,
  decodeNoticeCursor: (cursor: string) =>
    cursor === "valido" ? { receivedAt: "2026-11-19T10:00:00.000000Z", id: "a0000000-0000-4000-8000-0000000000a1" } : null,
}));
vi.mock("@/lib/growth/lead-retention", () => ({
  eraseExpiredContactLeads: mocks.eraseLeads,
}));
vi.mock("@/modules/element-library/application/withdrawals", () => ({
  listCatalogElementsForReview: mocks.listElements,
  withdrawCatalogElement: mocks.withdraw,
  decodeElementCursor: () => null,
}));

import { GET as retentionCron } from "@/app/api/cron/content-notices-retention/route";
import { GET as leadRetentionCron } from "@/app/api/cron/lead-retention/route";
import { POST as submitRoute } from "@/app/api/public/content-notices/route";
import { PATCH as updateNoticeRoute } from "@/app/api/super-admin/content-notices/[noticeId]/route";
import { GET as listNoticesRoute } from "@/app/api/super-admin/content-notices/route";
import { POST as withdrawRoute } from "@/app/api/super-admin/element-library/elements/[elementId]/withdraw/route";
import { GET as listElementsRoute } from "@/app/api/super-admin/element-library/elements/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORIGIN = "https://zaltyko.test";
const NOTICE = "a0000000-0000-4000-8000-0000000000a1";
const ELEMENT = "a0000000-0000-4000-8000-0000000000e1";
const PUBLIC_PATH = "/api/public/content-notices";
const allowed = { success: true, limit: 5, remaining: 4, reset: 0 };
const blocked = { success: false, limit: 5, remaining: 0, reset: 0 };

function request(path: string, method: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function noticeBody(overrides: Record<string, unknown> = {}) {
  return {
    contentKind: "element",
    contentUrl: "https://zaltyko.com/owner/biblioteca?elemento=ci",
    reason: "La descripción reproduce un texto del que tenemos los derechos.",
    senderName: "Ana Pérez",
    senderEmail: "ana@example.invalid",
    goodFaith: true,
    website: null,
    ...overrides,
  };
}

const params = (values: Record<string, string>) => ({ params: Promise.resolve(values) });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.runCronWithLease.mockImplementation(async (_name: string, job: () => Promise<unknown>) => ({
    acquired: true,
    value: await job(),
  }));
  mocks.rateLimit.mockResolvedValue(allowed);
  mocks.resolveUserId.mockResolvedValue("user-1");
  mocks.getCurrentProfile.mockResolvedValue({ id: "profile-1", role: "super_admin", isSuspended: false });
});

describe("POST /api/public/content-notices", () => {
  it("rechaza otro origen sin guardar", async () => {
    const response = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody(), "https://otro.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("responde 201 al campo trampa sin validar, limitar ni guardar", async () => {
    const response = await submitRoute(request(PUBLIC_PATH, "POST", { website: "spam.example", goodFaith: false }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("rechaza cuerpos de más de 8 KB con 413", async () => {
    const response = await submitRoute(
      request(PUBLIC_PATH, "POST", JSON.stringify(noticeBody({ reason: "x".repeat(9000) })))
    );
    expect(response.status).toBe(413);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("aplica el límite por IP (5 por hora) antes de validar", async () => {
    mocks.rateLimit.mockResolvedValueOnce(blocked);
    const response = await submitRoute(request(PUBLIC_PATH, "POST", { nada: true }));
    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rateLimit.mock.calls[0]?.[0]).toEqual({
      identifier: "content-notices:ip:203.0.113.10",
      limit: 5,
      window: 3600,
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("aplica el límite por correo (3 al día) después de validar", async () => {
    mocks.rateLimit.mockResolvedValueOnce(allowed).mockResolvedValueOnce(blocked);
    const response = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody()));
    expect(response.status).toBe(429);
    expect(mocks.rateLimit.mock.calls[1]?.[0]).toEqual({
      identifier: `${PUBLIC_PATH}:address:hash`,
      limit: 3,
      window: 86400,
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("exige la declaración de buena fe (400)", async () => {
    for (const body of [noticeBody({ goodFaith: false }), noticeBody({ goodFaith: undefined })]) {
      const response = await submitRoute(request(PUBLIC_PATH, "POST", body));
      expect(response.status).toBe(400);
      const problem = await response.json();
      expect(problem.detail).toMatch(/buena fe/);
      expect(problem.errors.fields).toContain("goodFaith");
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("valida con un esquema estricto y solo admite direcciones de Zaltyko", async () => {
    const invalid = [
      noticeBody({ contentUrl: "https://otro.example/elemento" }),
      noticeBody({ contentUrl: "http://zaltyko.com/owner" }),
      noticeBody({ contentUrl: "//otro.example/elemento" }),
      noticeBody({ reason: "corto" }),
      noticeBody({ senderEmail: "no-es-correo" }),
      noticeBody({ contentKind: "cualquiera" }),
      noticeBody({ extra: "campo" }),
    ];
    for (const body of invalid) {
      const response = await submitRoute(request(PUBLIC_PATH, "POST", body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("guarda el aviso normalizado y no devuelve datos", async () => {
    mocks.submit.mockResolvedValue({ replayed: false });
    const response = await submitRoute(
      request(PUBLIC_PATH, "POST", noticeBody({ senderEmail: "Ana@Example.INVALID", contentUrl: "/owner/biblioteca" }))
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ senderEmail: "ana@example.invalid", contentUrl: "/owner/biblioteca", goodFaith: true })
    );
  });

  it("un reenvío idéntico responde igual (201) y el servicio no duplica", async () => {
    mocks.submit.mockResolvedValueOnce({ replayed: false }).mockResolvedValueOnce({ replayed: true });
    const first = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody()));
    const again = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody()));
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(await again.json()).toEqual({ ok: true, data: { received: true } });
    expect(mocks.submit.mock.calls[0]?.[0]).toEqual(mocks.submit.mock.calls[1]?.[0]);
  });

  it("propaga 503 si faltan las tablas", async () => {
    mocks.submit.mockRejectedValueOnce(new OperationalError("FEATURE_NOT_AVAILABLE", "No disponible", 503));
    const response = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody()));
    expect(response.status).toBe(503);
  });

  it("un error inesperado da 500 y solo registra su tipo, nunca el detalle con datos", async () => {
    const failure = Object.assign(new Error("duplicate key (ana@example.invalid)"), { detail: "Ana Pérez" });
    mocks.submit.mockRejectedValueOnce(failure);
    const response = await submitRoute(request(PUBLIC_PATH, "POST", noticeBody()));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("ana@example.invalid");
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), undefined, { name: "Error" });
    expect(JSON.stringify(mocks.loggerError.mock.calls[0])).not.toMatch(/ana@example|Ana Pérez/);
  });
});

describe("rutas del superadministrador", () => {
  const calls = () => [
    () => listElementsRoute(request("/api/super-admin/element-library/elements", "GET"), {}),
    () =>
      withdrawRoute(
        request(`/api/super-admin/element-library/elements/${ELEMENT}/withdraw`, "POST", { reason: "Aviso de la federación" }),
        params({ elementId: ELEMENT })
      ),
    () => listNoticesRoute(request("/api/super-admin/content-notices", "GET"), {}),
    () =>
      updateNoticeRoute(
        request(`/api/super-admin/content-notices/${NOTICE}`, "PATCH", { status: "closed" }),
        params({ noticeId: NOTICE })
      ),
  ];

  it.each(["owner", "admin", "coach"])("deniegan el rol %s con 403 sin leer ni escribir", async (role) => {
    mocks.getCurrentProfile.mockResolvedValue({ id: "profile-1", role, isSuspended: false });
    for (const call of calls()) expect((await call()).status).toBe(403);
    for (const service of [mocks.listElements, mocks.withdraw, mocks.listNotices, mocks.updateNotice]) {
      expect(service).not.toHaveBeenCalled();
    }
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("deniegan sin sesión con 401", async () => {
    mocks.resolveUserId.mockResolvedValue(null);
    for (const call of calls()) expect((await call()).status).toBe(401);
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("retira un elemento con motivo y deja constancia sin academia", async () => {
    mocks.withdraw.mockResolvedValue({
      id: ELEMENT,
      elementKey: "ci_vault_one",
      editionCode: "fig-wag-2025-2028",
      name: "Salto de prueba",
      withdrawnAt: "2026-11-19T10:00:00.000Z",
    });
    const response = await withdrawRoute(
      request(`/api/super-admin/element-library/elements/${ELEMENT}/withdraw`, "POST", {
        reason: "Aviso de la federación sobre la descripción",
        noticeId: NOTICE,
      }),
      params({ elementId: ELEMENT })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.withdraw).toHaveBeenCalledWith(ELEMENT, {
      reason: "Aviso de la federación sobre la descripción",
      noticeId: NOTICE,
    });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tenantId: null,
        action: "element_library.element_withdrawn",
        resourceType: "catalog_element",
        resourceId: ELEMENT,
        meta: expect.objectContaining({ noticeId: NOTICE, elementKey: "ci_vault_one" }),
      })
    );
  });

  it("exige un motivo de 10 a 500 caracteres y el mismo origen para retirar", async () => {
    for (const reason of ["corto", "x".repeat(501)]) {
      const response = await withdrawRoute(
        request(`/api/super-admin/element-library/elements/${ELEMENT}/withdraw`, "POST", { reason }),
        params({ elementId: ELEMENT })
      );
      expect(response.status).toBe(400);
    }
    const crossSite = await withdrawRoute(
      request(
        `/api/super-admin/element-library/elements/${ELEMENT}/withdraw`,
        "POST",
        { reason: "Aviso de la federación" },
        "https://otro.invalid"
      ),
      params({ elementId: ELEMENT })
    );
    expect(crossSite.status).toBe(403);
    const badNotice = await withdrawRoute(
      request(`/api/super-admin/element-library/elements/${ELEMENT}/withdraw`, "POST", {
        reason: "Aviso de la federación",
        noticeId: "no-es-una-referencia",
      }),
      params({ elementId: ELEMENT })
    );
    expect(badNotice.status).toBe(400);
    expect((await badNotice.json()).message).toMatch(/referencia del aviso/);
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("un error inesperado del panel da 500 y registra solo tipo y código", async () => {
    const failure = Object.assign(new Error("violates check (ana@example.invalid)"), { code: "23514" });
    mocks.listNotices.mockRejectedValueOnce(failure);
    const response = await listNoticesRoute(request("/api/super-admin/content-notices", "GET"), {});
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), undefined, { name: "Error", code: "23514" });
  });

  it("propaga 409 si el elemento ya estaba retirado, sin constancia nueva", async () => {
    mocks.withdraw.mockRejectedValue(new OperationalError("INVALID_STATE_TRANSITION", "Ya retirado", 409));
    const response = await withdrawRoute(
      request(`/api/super-admin/element-library/elements/${ELEMENT}/withdraw`, "POST", { reason: "Aviso de la federación" }),
      params({ elementId: ELEMENT })
    );
    expect(response.status).toBe(409);
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it("cierra un aviso y valida la consulta de la bandeja", async () => {
    mocks.updateNotice.mockResolvedValue({ id: NOTICE, status: "closed", closedAt: "2026-11-19T10:00:00.000Z" });
    const response = await updateNoticeRoute(
      request(`/api/super-admin/content-notices/${NOTICE}`, "PATCH", { status: "closed", response: "Retirado." }),
      params({ noticeId: NOTICE })
    );
    expect(response.status).toBe(200);
    expect(mocks.updateNotice).toHaveBeenCalledWith(NOTICE, { status: "closed", response: "Retirado." });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, resourceType: "content_notice", resourceId: NOTICE })
    );

    const empty = await updateNoticeRoute(
      request(`/api/super-admin/content-notices/${NOTICE}`, "PATCH", {}),
      params({ noticeId: NOTICE })
    );
    expect(empty.status).toBe(400);

    mocks.listNotices.mockResolvedValue({ items: [], nextCursor: null });
    expect((await listNoticesRoute(request("/api/super-admin/content-notices?status=closed&cursor=valido", "GET"), {})).status).toBe(200);
    expect(mocks.listNotices).toHaveBeenCalledWith({
      status: "closed",
      limit: undefined,
      cursor: { receivedAt: "2026-11-19T10:00:00.000000Z", id: NOTICE },
    });
    for (const query of ["?status=otro", "?cursor=roto", "?status=closed&status=received", "?otra=1"]) {
      expect((await listNoticesRoute(request(`/api/super-admin/content-notices${query}`, "GET"), {})).status).toBe(400);
    }
    expect(mocks.listNotices).toHaveBeenCalledTimes(1);
  });
});

describe("cron de conservación de avisos", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret-de-prueba";
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("rechaza peticiones sin el secreto antes de tocar nada", async () => {
    const without = await retentionCron(new Request("https://zaltyko.com/api/cron/content-notices-retention"));
    expect(without.status).toBe(401);
    const wrong = await retentionCron(
      new Request("https://zaltyko.com/api/cron/content-notices-retention", { headers: { authorization: "Bearer otro" } })
    );
    expect(wrong.status).toBe(401);
    expect(mocks.erase).not.toHaveBeenCalled();
  });

  it("con el secreto borra remitentes y responde solo contadores", async () => {
    mocks.erase.mockResolvedValue({ enabled: true, erased: 2, batches: 1 });
    const response = await retentionCron(
      new Request("https://zaltyko.com/api/cron/content-notices-retention", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret-de-prueba" },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { enabled: true, erased: 2, batches: 1 } });
  });

  it("la candidata del programador es diaria, no está aplicada y llama a la ruta", () => {
    const candidate = readFileSync(
      join(process.cwd(), "docs/deployment/scheduler/candidates/content-notices-retention.sql"),
      "utf8"
    );
    expect(candidate).toContain("NO APLICADO en ningún entorno");
    expect(candidate).toContain(
      "select cron.schedule('zaltyko-content-notices-retention', '15 3 * * *', $$select zaltyko_scheduler.call_cron('content-notices-retention')$$);"
    );
    expect(candidate).not.toMatch(/create (or replace )?function/i);
    expect(
      readFileSync(join(process.cwd(), "docs/deployment/scheduler/20261115_pg_cron_avisos.sql"), "utf8")
    ).not.toContain("content-notices-retention");
  });
});

describe("cron de conservación de solicitudes de contacto", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret-de-prueba";
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("rechaza peticiones sin el secreto antes de iniciar la tarea", async () => {
    const without = await leadRetentionCron(
      new Request("https://zaltyko.com/api/cron/lead-retention")
    );
    const wrong = await leadRetentionCron(
      new Request("https://zaltyko.com/api/cron/lead-retention", {
        headers: { authorization: "Bearer otro" },
      })
    );

    expect(without.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mocks.eraseLeads).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).not.toHaveBeenCalled();
  });

  it("responde sin cambios cuando no hay leads vencidos y no expone datos personales", async () => {
    mocks.eraseLeads.mockResolvedValue({
      enabled: true,
      erasedLeads: 0,
      erasedInteractions: 0,
      erasedLeadTrials: 0,
      erasedTrialOutcomes: 0,
      erasedInterviews: 0,
      erasedGrowthEvents: 0,
      erasedEmailLogs: 0,
      unlinkedAcademyTrials: 0,
      batches: 0,
    });
    const response = await leadRetentionCron(
      new Request("https://zaltyko.com/api/cron/lead-retention", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret-de-prueba" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        enabled: true,
        erasedLeads: 0,
        erasedInteractions: 0,
        erasedLeadTrials: 0,
        erasedTrialOutcomes: 0,
        erasedInterviews: 0,
        erasedGrowthEvents: 0,
        erasedEmailLogs: 0,
        unlinkedAcademyTrials: 0,
        batches: 0,
      },
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ enabled: true, erasedLeads: 0, batches: 0 })
    );
  });

  it("ejecuta la retención autorizada y registra únicamente recuentos", async () => {
    const counts = {
      enabled: true,
      erasedLeads: 2,
      erasedInteractions: 3,
      erasedLeadTrials: 1,
      erasedTrialOutcomes: 1,
      erasedInterviews: 1,
      erasedGrowthEvents: 2,
      erasedEmailLogs: 2,
      unlinkedAcademyTrials: 1,
      batches: 1,
    };
    mocks.eraseLeads.mockResolvedValue(counts);
    const response = await leadRetentionCron(
      new Request("https://zaltyko.com/api/cron/lead-retention", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret-de-prueba" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: counts });
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining(counts)
    );
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toMatch(/@|nombre|correo|message/i);
  });

  it("no vuelve a borrar si el lease ya está ocupado", async () => {
    mocks.runCronWithLease.mockResolvedValueOnce({ acquired: false });

    const response = await leadRetentionCron(
      new Request("https://zaltyko.com/api/cron/lead-retention", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret-de-prueba" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { skipped: true, reason: "ALREADY_RUNNING" },
    });
    expect(mocks.eraseLeads).not.toHaveBeenCalled();
  });

  it("deja la candidata sin aplicar y documenta su programación", () => {
    const candidate = readFileSync(
      join(process.cwd(), "docs/deployment/scheduler/candidates/lead-retention.sql"),
      "utf8"
    );
    expect(candidate).toContain("NO APLICADO en ningún entorno");
    expect(candidate).toContain(
      "select cron.schedule('zaltyko-lead-retention', '15 3 * * *', $$select zaltyko_scheduler.call_cron('lead-retention')$$);"
    );
    expect(candidate).not.toMatch(/create (or replace )?function/i);
    expect(readFileSync(join(process.cwd(), "docs/deployment/scheduler/README.md"), "utf8")).toContain(
      "`zaltyko-lead-retention`"
    );
  });
});
