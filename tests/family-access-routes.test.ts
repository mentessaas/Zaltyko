import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ userId: "", dbTouched: 0 }));

vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: () => {
        holder.dbTouched += 1;
        throw new Error("La base de datos no debe tocarse en esta prueba");
      },
    }
  ),
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => (holder.userId ? { id: holder.userId } : null),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: async () => ({ success: true, limit: 1000, remaining: 999, reset: Math.floor(Date.now() / 1000) + 60 }),
}));

import { familyOwnsGuardian } from "@/modules/family-access/application/family-notice-reads";

const ORIGIN = "https://club.example.test";
const ORG = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

type Case = {
  name: string;
  load: () => Promise<Record<string, (request: Request, context?: never) => Promise<Response>>>;
  method: "POST" | "PUT";
  path: string;
  body: unknown;
  params?: Record<string, string>;
};

const cases: Case[] = [
  { name: "comandos de acceso", load: () => import("@/app/api/v1/owner/family-access/route") as never, method: "POST", path: "/api/v1/owner/family-access", body: { organizationId: ORG, locationId: SITE, action: "invite_all", grantViewAthletes: true } },
  { name: "aviso manual", load: () => import("@/app/api/v1/owner/family-notices/route") as never, method: "POST", path: "/api/v1/owner/family-notices", body: { organizationId: ORG, locationId: SITE, target: { kind: "group", groupId: SESSION }, title: "Aviso", body: "Texto" } },
  { name: "cambio de sesión", load: () => import("@/app/api/v1/owner/sessions/[sessionId]/change/route") as never, method: "POST", path: `/api/v1/owner/sessions/${SESSION}/change`, body: { organizationId: ORG, locationId: SITE, action: "cancel", reason: null }, params: { sessionId: SESSION } },
  { name: "revisar invitación", load: () => import("@/app/api/v1/family/invitations/inspect/route") as never, method: "POST", path: "/api/v1/family/invitations/inspect", body: { token: "a".repeat(43) } },
  { name: "aceptar invitación", load: () => import("@/app/api/v1/family/invitations/accept/route") as never, method: "POST", path: "/api/v1/family/invitations/accept", body: { token: "a".repeat(43) } },
  { name: "marcar leídos", load: () => import("@/app/api/v1/family/notices/read/route") as never, method: "POST", path: "/api/v1/family/notices/read", body: { noticeIds: [SESSION] } },
  { name: "preferencias", load: () => import("@/app/api/v1/family/notification-preferences/route") as never, method: "PUT", path: "/api/v1/family/notification-preferences", body: { organizationId: ORG, emailSessionChanges: false, emailManualNotices: true } },
];

function request(item: Case, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json", "idempotency-key": "family-test-0001" };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}${item.path}`, { method: item.method, headers, body: JSON.stringify(item.body) });
}

async function call(item: Case, origin?: string | null) {
  const route = await item.load();
  const handler = route[item.method]!;
  const context = { params: Promise.resolve(item.params ?? {}) } as never;
  return handler(request(item, origin), context);
}

const previousFlag = process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;

beforeEach(() => {
  holder.userId = "";
  holder.dbTouched = 0;
});
afterEach(() => {
  if (previousFlag === undefined) delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
  else process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = previousFlag;
});

describe("rutas del acceso de familias y de los avisos", () => {
  it.each(cases)("con la bandera apagada, $name responde 503 sin leer la sesión ni la base", async (item) => {
    delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
    holder.userId = USER;
    const response = await call(item);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(holder.dbTouched).toBe(0);
    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it.each(cases)("con la bandera encendida, $name exige sesión (401)", async (item) => {
    process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = "true";
    const response = await call(item);
    expect(response.status).toBe(401);
    expect(holder.dbTouched).toBe(0);
  });

  it.each(cases)("$name rechaza otro origen o sin origen (403)", async (item) => {
    process.env.ZALTYKO_FAMILY_ACCESS_ENABLED = "true";
    holder.userId = USER;
    expect((await call(item, "https://evil.example.test")).status).toBe(403);
    expect((await call(item, null)).status).toBe(403);
    expect(holder.dbTouched).toBe(0);
  });

  it("ninguna respuesta refleja el token recibido", async () => {
    delete process.env.ZALTYKO_FAMILY_ACCESS_ENABLED;
    const token = "Z".repeat(43);
    const route = await import("@/app/api/v1/family/invitations/accept/route");
    const response = await route.POST(
      new Request(`${ORIGIN}/api/v1/family/invitations/accept`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ token }),
      })
    );
    expect(await response.text()).not.toContain(token);
  });
});

describe("guarda SQL de los avisos del portal", () => {
  const dialect = new PgDialect();

  it("liga el tutor a la cuenta de la sesión, activo, en academia operativa y con vínculo activo", () => {
    const query = dialect.sqlToQuery(
      familyOwnsGuardian({ userId: USER, organizationRef: sql`r.organization_id`, guardianRef: sql`r.guardian_id` })
    );
    const text = query.sql.replace(/\s+/g, " ");
    expect(query.params).toEqual([USER]);
    expect(text).toContain("fa_g.auth_user_id = $1::uuid");
    expect(text).toContain("fa_g.is_active");
    expect(text).toContain("fa_o.status in ('trial', 'active')");
    expect(text).toContain("fa_g.organization_id = r.organization_id");
    expect(text).toContain("fa_g.id = r.guardian_id");
    expect(text).toContain("fa_fg.is_active and fa_f.is_active and fa_fg.can_view_athletes");
  });

  it("las lecturas y escrituras de la familia llevan la guarda en cada consulta", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/modules/family-access/application/family-notice-reads.ts", "utf8");
    // Lista de avisos (dos consultas), marcar leídos y preferencias.
    expect(source.match(/\$\{familyOwnsGuardian\(\{ userId: input\.userId,/g)).toHaveLength(4);
    // Ninguna consulta de la familia acepta un tutor o una familia del cliente.
    expect(source).not.toMatch(/guardianId: (?:parsed|input)\./);
  });
});
