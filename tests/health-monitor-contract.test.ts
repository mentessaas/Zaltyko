import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { executeMock, rateLimitMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: executeMock } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  getLimitForRoute: () => ({ limit: 100, window: 60 }),
  getClientIdentifier: () => "ip:monitor",
}));

import { GET as readiness } from "@/app/api/health/route";
import { GET as liveness } from "@/app/api/health/live/route";
import { logger } from "@/lib/logger";
import { middleware } from "../middleware";

/**
 * Fragmentos que nunca deben salir en la respuesta pública: detalles del
 * error de la base de datos, proveedor, host, versión o valor de un secreto.
 */
const DB_ERROR =
  "connect ECONNREFUSED db.abcdefghijklmnop.supabase.co:5432 password authentication failed for user postgres PostgreSQL 15.8";
const SECRET_VALUE = "cron-secret-value-never-public";
const FORBIDDEN_FRAGMENTS = [
  "ECONNREFUSED",
  "supabase",
  "5432",
  "postgres",
  "PostgreSQL",
  "password",
  SECRET_VALUE,
  "CRON_SECRET",
  "DATABASE_URL",
  "stack",
];

function expectMonitorHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  expect(response.headers.get("content-type")).toContain("application/json");
}

async function expectNoInternals(response: Response) {
  const text = await response.clone().text();
  for (const fragment of FORBIDDEN_FRAGMENTS) {
    expect(text).not.toContain(fragment);
  }
  return JSON.parse(text);
}

beforeEach(() => {
  executeMock.mockReset();
  rateLimitMock.mockReset();
  vi.mocked(logger.error).mockClear();
  vi.stubEnv("CRON_SECRET", SECRET_VALUE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/health (readiness)", () => {
  it("responde 200 sin caché cuando la base de datos contesta a select 1", async () => {
    executeMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const response = await readiness();

    expect(response.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expectMonitorHeaders(response);
    const body = await expectNoInternals(response);
    expect(body).toEqual({
      ok: true,
      data: {
        status: "ok",
        checks: {
          database: { status: "ok", latencyMs: expect.any(Number) },
          cronAuth: { status: "ok" },
        },
        timestamp: expect.any(String),
      },
    });
    expect(Object.keys(body.data)).toEqual(["status", "checks", "timestamp"]);
  });

  it("responde 503 genérico sin filtrar el error crudo de la base de datos", async () => {
    executeMock.mockRejectedValue(new Error(DB_ERROR));

    const response = await readiness();

    expect(response.status).toBe(503);
    expectMonitorHeaders(response);
    const body = await expectNoInternals(response);
    expect(body).toEqual({
      ok: false,
      error: "HEALTH_CHECK_FAILED",
      code: "HEALTH_CHECK_FAILED",
      message: "Service health check failed",
      details: {
        status: "degraded",
        checks: { database: { status: "failed", latencyMs: expect.any(Number) } },
        timestamp: expect.any(String),
      },
    });
    // El detalle solo va al logger del servidor (Sentry), nunca al cliente.
    expect(logger.error).toHaveBeenCalledWith(
      "Health check failed",
      expect.any(Error),
      expect.objectContaining({ check: "database", outcome: "failed" })
    );
  });

  it("responde 503 a los 2 s si la base de datos no contesta", async () => {
    vi.useFakeTimers();
    executeMock.mockReturnValue(new Promise<never>(() => undefined));

    let settled = false;
    const pending = readiness().then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;

    expect(response.status).toBe(503);
    expectMonitorHeaders(response);
    const body = await expectNoInternals(response);
    expect(body.details.checks.database.status).toBe("timeout");
    expect(logger.error).toHaveBeenCalledWith(
      "Health check failed",
      expect.any(Error),
      expect.objectContaining({ outcome: "timeout" })
    );
  });

  it("también responde 503 si inicializar la base de datos falla de forma síncrona", async () => {
    executeMock.mockImplementation(() => {
      throw new Error(DB_ERROR);
    });

    const response = await readiness();

    expect(response.status).toBe(503);
    await expectNoInternals(response);
  });

  it("señala la falta de autenticación de cron sin cambiar el código HTTP", async () => {
    vi.stubEnv("CRON_SECRET", "");
    executeMock.mockResolvedValue({ rows: [] });

    const response = await readiness();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.checks.cronAuth).toEqual({ status: "missing" });
  });
});

describe("GET /api/health/live (liveness)", () => {
  it("responde 200 sin caché y sin tocar la base de datos", async () => {
    const response = liveness();

    expect(response.status).toBe(200);
    expect(executeMock).not.toHaveBeenCalled();
    expectMonitorHeaders(response);
    const body = await expectNoInternals(response);
    expect(body).toEqual({ ok: true, data: { status: "ok", timestamp: expect.any(String) } });
  });
});

describe("middleware ante el monitor externo", () => {
  it.each(["/api/health", "/api/health/live"])(
    "deja pasar GET %s sin sesión, sin rate limit y sin redirección",
    async (path) => {
      const response = await middleware(
        new NextRequest(`https://zaltyko.com${path}`, {
          headers: { host: "zaltyko.com", "user-agent": "uptime-monitor" },
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
      expect(rateLimitMock).not.toHaveBeenCalled();
    }
  );

  it("redirige www al dominio canónico: el monitor debe usar https://zaltyko.com", async () => {
    const response = await middleware(
      new NextRequest("https://www.zaltyko.com/api/health", { headers: { host: "www.zaltyko.com" } })
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://zaltyko.com/api/health");
  });
});
