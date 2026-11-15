import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));
vi.mock("@/lib/cron-lease", () => ({
  runCronWithLease: vi.fn(async (_name: string, job: () => Promise<unknown>) => ({ acquired: true, value: await job() })),
}));
// El límite de peticiones tiene sus propias pruebas; aquí el contenedor pasa el manejador tal cual.
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { STRICT: { limit: 10, window: 60 } },
  withRateLimit: (handler: unknown) => handler,
}));

import { GET as coachCron } from "@/app/api/cron/coach-session-reminders/route";
import { POST as digestCron } from "@/app/api/cron/owner-weekly-digest/route";
import { GET as riskCron } from "@/app/api/cron/usage-at-risk/route";
import { GET as preferencesPage, POST as preferencesSave } from "@/app/api/habitual-use/preferences/route";
import {
  buildHabitualUsePreferencesUrl,
  HABITUAL_USE_PREFERENCES_PATH,
} from "@/modules/habitual-use/application/preferences";
import { USAGE_EVENTS_COLUMNS } from "@/modules/habitual-use/application/storage";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("crons de uso habitual: autorización", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret-de-prueba";
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  const crons = [
    ["coach-session-reminders", coachCron],
    ["owner-weekly-digest", digestCron],
    ["usage-at-risk", riskCron],
  ] as const;

  it.each(crons)("%s rechaza peticiones sin el secreto del cron", async (name, handler) => {
    const without = await handler(new Request(`https://zaltyko.com/api/cron/${name}`));
    expect(without.status).toBe(401);
    const wrong = await handler(
      new Request(`https://zaltyko.com/api/cron/${name}`, { headers: { authorization: "Bearer otro" } })
    );
    expect(wrong.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(crons)("%s responde 503 si el cron no está configurado", async (name, handler) => {
    delete process.env.CRON_SECRET;
    const response = await handler(new Request(`https://zaltyko.com/api/cron/${name}`));
    expect(response.status).toBe(503);
  });

  it.each(crons)("%s con credencial y banderas apagadas no toca nada", async (name, handler) => {
    const response = await handler(
      new Request(`https://zaltyko.com/api/cron/${name}`, {
        headers: { authorization: "Bearer cron-secret-de-prueba" },
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("página pública de preferencias", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UNSUBSCRIBE_HMAC_SECRET = "s".repeat(32);
    mocks.execute.mockResolvedValue({ rows: [] });
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  const url = () => buildHabitualUsePreferencesUrl("https://zaltyko.com", "Direccion@Ejemplo.test", "owner_weekly_digest")!;
  const token = () => new URL(url()).searchParams.get("token")!;

  it("el enlace apunta a la ruta de preferencias con el tipo de aviso", () => {
    expect(url()).toContain(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}?kind=owner_weekly_digest&token=`);
  });

  it("ver la página no cambia nada: los escáneres de correo abren los enlaces", async () => {
    const response = await preferencesPage(new Request(url()) as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Dejar de recibirlos");
    expect(mocks.execute).toHaveBeenCalledTimes(1); // solo la lectura de la preferencia
  });

  it("un token roto, caducado o de otro tipo de aviso no sirve", async () => {
    const bad = await preferencesPage(
      new Request(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}?kind=owner_weekly_digest&token=abc.def`) as never
    );
    expect(bad.status).toBe(400);
    const unknownKind = await preferencesPage(
      new Request(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}?kind=otra_cosa&token=${token()}`) as never
    );
    expect(unknownKind.status).toBe(400);
    const form = new URLSearchParams({ token: "abc.def", kind: "owner_weekly_digest", enabled: "false" });
    const save = await preferencesSave(
      new Request(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}`, { method: "POST", body: form }) as never
    );
    expect(save.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("guardar con el token válido registra la preferencia de esa dirección", async () => {
    const form = new URLSearchParams({ token: token(), kind: "owner_weekly_digest", enabled: "false" });
    const response = await preferencesSave(
      new Request(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}`, { method: "POST", body: form }) as never
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Has desactivado estos avisos");
    expect(html).toContain("Volver a activarlos");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("rechaza valores de «enabled» que no sean true o false", async () => {
    const form = new URLSearchParams({ token: token(), kind: "owner_weekly_digest", enabled: "quizas" });
    const response = await preferencesSave(
      new Request(`https://zaltyko.com${HABITUAL_USE_PREFERENCES_PATH}`, { method: "POST", body: form }) as never
    );
    expect(response.status).toBe(400);
  });
});

describe("contrato de la candidata y de la configuración", () => {
  const candidate = read("docs/deployment/candidates/20261114130000_habitual_use_candidate.sql");
  const executable = candidate.replace(/--[^\n]*/g, "").toLowerCase();

  it("la tabla de la candidata tiene exactamente las columnas que detecta el almacenamiento", () => {
    const body = executable.slice(executable.indexOf("create table public.usage_events"));
    const items = body.slice(body.indexOf("(") + 1, body.indexOf("constraint usage_events_event_name_check"));
    const columns = items
      .split(",\n")
      .map((line) => /^\s*([a-z_]+)\s/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name))
      .sort();
    expect(columns).toEqual([...USAGE_EVENTS_COLUMNS].sort());
  });

  it("no guarda ninguna referencia a personas, cuentas, gimnastas ni menores", () => {
    for (const forbidden of ["user_id", "athlete", "person", "guardian", "family_id", "email", "name text", "birth", "ip_address"]) {
      expect(executable.replace(/event_name|actor_role/g, ""), forbidden).not.toContain(forbidden);
    }
    expect(executable).toContain("references zaltyko.organizations(id) on delete cascade");
  });

  it("crea los dos índices por hora y documenta la vuelta atrás", () => {
    expect(executable).toContain("create index sessions_starts_at_idx on zaltyko.sessions(starts_at)");
    expect(executable).toContain("create index sessions_ends_at_idx on zaltyko.sessions(ends_at)");
    expect(candidate).toMatch(/Vuelta atrás[\s\S]*drop table if exists public\.usage_events/);
    expect(read("docs/deployment/candidates/README.md")).toContain("Vuelta atrás");
  });

  it("activa y fuerza RLS y no da permisos a clientes directos", () => {
    expect(executable).toContain("alter table public.usage_events enable row level security");
    expect(executable).toContain("alter table public.usage_events force row level security");
    expect(executable).toContain("revoke all on table public.usage_events from public, anon, authenticated");
    expect(executable).not.toMatch(/\bgrant\b/);
    expect(executable).not.toContain("create policy");
  });

  it("el README de candidatas cita el hash exacto del archivo", async () => {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(readFileSync(join(ROOT, "docs/deployment/candidates/20261114130000_habitual_use_candidate.sql"))).digest("hex");
    expect(read("docs/deployment/candidates/README.md")).toContain(hash);
  });

  it("todas las banderas figuran apagadas en .env.example", () => {
    const env = read(".env.example");
    for (const name of [
      "ZALTYKO_HABITUAL_USE_ENABLED",
      "ZALTYKO_COACH_REMINDERS_ENABLED",
      "ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED",
      "ZALTYKO_USAGE_METRICS_ENABLED",
      "ZALTYKO_AT_RISK_ALERTS_ENABLED",
    ]) {
      expect(env, name).toContain(`\n${name}=false\n`);
    }
    expect(env).toMatch(/\nZALTYKO_AT_RISK_ALERT_EMAIL=\n/);
    expect(env).toMatch(/\nZALTYKO_USAGE_PSEUDONYM_SECRET=\n/);
  });

  it("los crons no están programados en vercel.json", () => {
    const vercel = read("vercel.json");
    for (const path of ["coach-session-reminders", "owner-weekly-digest", "usage-at-risk"]) {
      expect(vercel).not.toContain(path);
    }
  });

  it("el módulo no importa el esquema legacy ni escribe en la base desde la vista", () => {
    const files = [
      "src/modules/habitual-use/application/preferences.ts",
      "src/modules/habitual-use/application/usage-events.ts",
      "src/modules/habitual-use/application/usage-metrics.ts",
    ];
    for (const file of files) expect(read(file), file).not.toMatch(/from "@\/db\/schema(\/|")/);
    expect(read("src/app/(super-admin)/super-admin/uso/page.tsx")).toContain('profile.role !== "super_admin"');
  });
});
