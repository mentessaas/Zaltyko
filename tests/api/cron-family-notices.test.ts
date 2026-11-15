import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  deliver: vi.fn(),
  lease: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/modules/family-access/application/family-access-storage", () => ({
  isFamilyAccessAvailableForPage: mocks.available,
}));
vi.mock("@/modules/family-access/application/family-notices", () => ({ deliverNoticeEmails: mocks.deliver }));
vi.mock("@/lib/cron-lease", () => ({ runCronWithLease: mocks.lease }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() } }));

import { GET, POST } from "@/app/api/cron/family-notices/route";

const CRON_URL = "https://zaltyko.com/api/cron/family-notices";
const withSecret = (secret = "cron-secret-de-prueba") =>
  new Request(CRON_URL, { headers: { authorization: `Bearer ${secret}` } });

describe("cron de reintento de avisos a familias", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret-de-prueba";
    mocks.lease.mockImplementation(async (_name: string, job: () => Promise<unknown>) => ({
      acquired: true,
      value: await job(),
    }));
    mocks.available.mockResolvedValue(true);
    mocks.deliver.mockResolvedValue({ sent: 2, failed: 0, pending: 0 });
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("acepta GET, que es como llama Vercel Cron, con el mismo manejador que POST", () => {
    expect(GET).toBe(POST);
  });

  it("sin el secreto responde 401 y no hace ningún trabajo", async () => {
    for (const request of [new Request(CRON_URL), withSecret("otro")]) {
      const response = await GET(request);
      expect(response.status).toBe(401);
    }
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.available).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado responde 503 y no hace nada", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(withSecret());
    expect(response.status).toBe(503);
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("con el secreto y la función apagada no envía nada", async () => {
    mocks.available.mockResolvedValue(false);
    const response = await GET(withSecret());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ skipped: true, reason: "FEATURE_OFF" });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("con el secreto y la función encendida reintenta los correos pendientes bajo lease", async () => {
    const response = await GET(withSecret());
    expect(response.status).toBe(200);
    expect(mocks.lease).toHaveBeenCalledWith("cron:family-notices", expect.any(Function));
    expect(mocks.deliver).toHaveBeenCalledWith({}, { batchSize: 25, budgetMs: 60_000 });
    expect((await response.json()).data).toMatchObject({ skipped: false, sent: 2 });
  });

  it("si otro disparo tiene el lease, no se solapa", async () => {
    mocks.lease.mockResolvedValue({ acquired: false });
    const response = await GET(withSecret());
    expect((await response.json()).data).toEqual({ skipped: true, reason: "LEASE_HELD" });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
