/**
 * ZAL-602: cobertura focal de `withAgentAuth` para cerrar el hueco P0/P1
 * del commit 94fe4d955 (acepta `x-paperclip-agent-id` contra el allowlist
 * `MARKETING_OUTREACH_AGENT_IDS` sin firma).
 *
 * Casos cubiertos:
 * - N-1  Header `x-paperclip-agent-id` allowlisted pero sin firma → 401.
 * - N-2  Header allowlisted + timestamp pero firma invalida → 401.
 * - N-3  Header allowlisted + firma pero timestamp fuera de ventana → 401.
 * - N-4  Header NO allowlisted (ID spoofeado pero no en la lista) → 401.
 * - N-5  Header allowlisted pero secret ausente → 401 (defensa-en-profundidad).
 * - G-1  Header allowlisted + timestamp + firma valida → 200 con agentId resuelto.
 * - G-2  Sin header → cae a super_admin (401 sin sesion).
 *
 * Estrategia: mockear `resolveUserId` y `getCurrentProfile` (que ya estan
 * testeados en otros archivos) para evitar acoplar el test a Supabase.
 * El handler interno es trivial — devuelve 200 con el agentId del contexto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import { withAgentAuth } from "@/lib/authz";

const TEST_AGENT_ID = "agent-test-001";
const OTHER_AGENT_ID = "agent-other-002";
const TEST_SECRET = "shared-secret-test-32bytes-or-more!!";

function signRequest({
  agentId,
  secret,
  timestampSeconds,
  method,
  pathname,
  body,
}: {
  agentId: string;
  secret: string;
  timestampSeconds: number;
  method: string;
  pathname: string;
  body: string;
}): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = `${agentId}\n${method}\n${pathname}\n${timestampSeconds}\n${bodyHash}`;
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

let getCurrentProfileMock: ReturnType<typeof vi.fn>;
let resolveUserIdMock: ReturnType<typeof vi.fn>;
let profileToReturn: any;
let userIdToReturn: string | null;

vi.mock("@/lib/authz/user-resolver", () => ({
  resolveUserId: vi.fn(async () => userIdToReturn),
}));

vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: vi.fn(async () => profileToReturn),
}));

vi.mock("@/db", () => ({
  db: {},
}));

const handler = withAgentAuth(async (_request, context) => {
  return new Response(
    JSON.stringify({
      ok: true,
      agentId: context.agentId,
      userId: context.userId ?? null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
});

async function callAgent(args: {
  method?: string;
  pathname?: string;
  body?: string;
  headers?: Record<string, string>;
}) {
  const url = `http://localhost${args.pathname ?? "/api/admin/marketing/outreach"}`;
  const method = (args.method ?? "POST").toUpperCase();
  // GET/HEAD no admiten body segun la spec de fetch — incluir `body: ""` aunque
  // sea vacio dispara "Request with GET/HEAD method cannot have body" antes de
  // llegar al handler bajo prueba. Omitimos el body solo para esos metodos.
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      ...(args.headers ?? {}),
    },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = args.body ?? "";
  }
  const request = new Request(url, init);
  return handler(request, {} as any);
}

const makeProfile = (role: string) => ({
  id: `profile-${role}`,
  userId: `user-${role}`,
  role,
  canLogin: true,
  tenantId: role === "super_admin" ? null : "tenant-1",
});

describe("withAgentAuth — ZAL-602 security", () => {
  beforeEach(() => {
    process.env.MARKETING_OUTREACH_AGENT_IDS =
      `${TEST_AGENT_ID},${OTHER_AGENT_ID}`;
    process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET = TEST_SECRET;
    process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT = "false";
    process.env.NODE_ENV = "test";
    delete process.env.MARKETING_OUTREACH_AGENT_MAX_SKEW_SECONDS;
    profileToReturn = null;
    userIdToReturn = null;
    getCurrentProfileMock = vi.fn(async () => profileToReturn);
    resolveUserIdMock = vi.fn(async () => userIdToReturn);
  });

  afterEach(() => {
    delete process.env.MARKETING_OUTREACH_AGENT_IDS;
    delete process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET;
    delete process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT;
    delete process.env.NODE_ENV;
    delete process.env.MARKETING_OUTREACH_AGENT_MAX_SKEW_SECONDS;
  });

  // ---- Casos negativos ----

  it("N-1: header allowlisted sin firma → 401 AGENT_AUTH_FAILED", async () => {
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-2: header allowlisted + timestamp + firma invalida → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
        "x-paperclip-agent-timestamp": String(now),
        "x-paperclip-agent-signature": "deadbeef".repeat(8),
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-3: firma valida pero timestamp fuera de ventana (>5min) → 401", async () => {
    const stale = Math.floor(Date.now() / 1000) - 60 * 60; // 1h atras
    const signature = signRequest({
      agentId: TEST_AGENT_ID,
      secret: TEST_SECRET,
      timestampSeconds: stale,
      method: "POST",
      pathname: "/api/admin/marketing/outreach",
      body: JSON.stringify({ hello: "world" }),
    });
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
        "x-paperclip-agent-timestamp": String(stale),
        "x-paperclip-agent-signature": signature,
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-4: header NO allowlisted (ID spoofeado) → 401 sin caer a super_admin", async () => {
    // super_admin ausente: tiene que rechazar, no aceptar.
    userIdToReturn = null;
    profileToReturn = null;
    const response = await callAgent({
      method: "GET",
      headers: {
        "x-paperclip-agent-id": "agent-spoofed-uuid-not-in-list",
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-5: header allowlisted pero secret ausente → 401 (defensa-en-profundidad)", async () => {
    delete process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const signature = signRequest({
      agentId: TEST_AGENT_ID,
      secret: TEST_SECRET,
      timestampSeconds: now,
      method: "POST",
      pathname: "/api/admin/marketing/outreach",
      body: JSON.stringify({ hello: "world" }),
    });
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
        "x-paperclip-agent-timestamp": String(now),
        "x-paperclip-agent-signature": signature,
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-6: NODE_ENV=production con dev bypass activado → 401, no cae a bypass", async () => {
    process.env.NODE_ENV = "production";
    process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT = "true";
    delete process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET;
    userIdToReturn = null;

    const response = await callAgent({
      method: "POST",
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
      },
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("AGENT_AUTH_FAILED");
  });

  it("N-7: replay con timestamp valido pero body modificado → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Firma del body ORIGINAL.
    const originalSignature = signRequest({
      agentId: TEST_AGENT_ID,
      secret: TEST_SECRET,
      timestampSeconds: now,
      method: "POST",
      pathname: "/api/admin/marketing/outreach",
      body: JSON.stringify({ hello: "world" }),
    });
    // El atacante cambia el body pero reusa la firma del original.
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({ hello: "WORLD-MUTATED" }),
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
        "x-paperclip-agent-timestamp": String(now),
        "x-paperclip-agent-signature": originalSignature,
      },
    });

    expect(response.status).toBe(401);
  });

  // ---- Casos positivos ----

  it("G-1: header allowlisted + firma valida + timestamp reciente → 200 con agentId resuelto", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ hello: "world" });
    const signature = signRequest({
      agentId: TEST_AGENT_ID,
      secret: TEST_SECRET,
      timestampSeconds: now,
      method: "POST",
      pathname: "/api/admin/marketing/outreach",
      body,
    });
    const response = await callAgent({
      method: "POST",
      body,
      headers: {
        "x-paperclip-agent-id": TEST_AGENT_ID,
        "x-paperclip-agent-timestamp": String(now),
        "x-paperclip-agent-signature": signature,
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.agentId).toBe(TEST_AGENT_ID);
    expect(payload.userId).toBeNull();
  });

  it("G-2: GET con firma valida sobre GET method + path → 200", async () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = signRequest({
      agentId: OTHER_AGENT_ID,
      secret: TEST_SECRET,
      timestampSeconds: now,
      method: "GET",
      pathname: "/api/admin/marketing/outreach",
      body: "",
    });
    const response = await callAgent({
      method: "GET",
      body: "",
      headers: {
        "x-paperclip-agent-id": OTHER_AGENT_ID,
        "x-paperclip-agent-timestamp": String(now),
        "x-paperclip-agent-signature": signature,
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.agentId).toBe(OTHER_AGENT_ID);
  });

  it("G-3: sin header y sin sesion → 401 UNAUTHENTICATED (cae a super_admin path)", async () => {
    userIdToReturn = null;
    profileToReturn = null;
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("UNAUTHENTICATED");
  });

  it("G-4: sesion super_admin valida sin header → 200 con agentId derivado", async () => {
    userIdToReturn = "user-super-admin";
    profileToReturn = makeProfile("super_admin");
    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.agentId).toBe("super-admin:profile-super_admin");
    expect(payload.userId).toBe("user-super-admin");
  });

  it("G-5: dev bypass explicito + secret unset + sandbox → acepta header sin firma", async () => {
    process.env.NODE_ENV = "test";
    process.env.MARKETING_OUTREACH_DEV_BYPASS_AGENT = "true";
    delete process.env.MARKETING_OUTREACH_AGENT_SHARED_SECRET;

    const response = await callAgent({
      method: "POST",
      body: JSON.stringify({}),
      headers: { "x-paperclip-agent-id": "agent-from-test" },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.agentId).toBe("agent-from-test");
  });
});