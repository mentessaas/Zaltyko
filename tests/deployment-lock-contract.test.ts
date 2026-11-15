import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { load } = require("js-yaml");

type CronEntry = { path: string; schedule: string };

/**
 * Programación autorizada por Elvis el 2026-11-15 para el plan Hobby de Vercel
 * (ADR-0016). Horas en UTC; Hobby dispara en cualquier minuto de la hora indicada.
 * Cambiarla exige actualizar esta lista, el ADR y la documentación de cada función.
 */
const AUTHORISED_CRONS: CronEntry[] = [
  { path: "/api/cron/usage-at-risk", schedule: "0 7 * * *" },
  { path: "/api/cron/owner-weekly-digest", schedule: "0 8 * * 1" },
  { path: "/api/cron/owner-weekly-digest", schedule: "0 16 * * 1" },
  { path: "/api/cron/family-payment-reminders", schedule: "0 16 * * *" },
  { path: "/api/cron/family-notices", schedule: "0 17 * * *" },
];

const config = () => JSON.parse(readFileSync("vercel.json", "utf8"));

/** Ruta del fichero Next.js que atiende un path de cron (sin query string). */
const routeFileFor = (path: string) => `src/app${path.split("?")[0]}/route.ts`;

describe("release stays locked during synthetic CI", () => {
  it("disables Git deployments and schedules only the authorised crons", () => {
    const current = config();
    expect(current.git.deploymentEnabled).toBe(false);
    expect(current.crons).toEqual(AUTHORISED_CRONS);
  });

  it("ningún cron corre más de una vez al día (límite del plan Hobby)", () => {
    for (const cron of config().crons as CronEntry[]) {
      const fields = cron.schedule.trim().split(/\s+/);
      expect(fields, cron.schedule).toHaveLength(5);
      const [minute, hour] = fields;
      // Minuto y hora fijos: sin «*», «/», «,» ni rangos, que lo dispararían varias veces al día.
      expect(minute, `${cron.path} ${cron.schedule}`).toMatch(/^\d{1,2}$/);
      expect(hour, `${cron.path} ${cron.schedule}`).toMatch(/^\d{1,2}$/);
      expect(Number(minute)).toBeLessThanOrEqual(59);
      expect(Number(hour)).toBeLessThanOrEqual(23);
    }
  });

  it("cada cron programado existe, acepta GET y exige el secreto antes de cualquier trabajo", () => {
    for (const cron of config().crons as CronEntry[]) {
      expect(cron.path, cron.path).toMatch(/^\/api\/cron\/[a-z0-9-]+(\?[a-z0-9=&-]+)?$/);
      const file = routeFileFor(cron.path);
      expect(existsSync(file), file).toBe(true);
      const source = readFileSync(file, "utf8");
      // Vercel Cron llama con GET.
      const handler = /export const GET = POST;/.test(source)
        ? "POST"
        : /export async function GET\(/.test(source)
          ? "GET"
          : null;
      expect(handler, `${file} no exporta GET`).not.toBeNull();
      // Lo primero que hace el manejador es comprobar CRON_SECRET y cortar si falla.
      expect(source, file).toMatch(
        new RegExp(
          `export async function ${handler}\\(request: Request\\) \\{\\s*const authError = requireCronAuth\\(request\\);\\s*if \\(authError\\) return authError;`
        )
      );
      expect(source, file).toMatch(/import \{ requireCronAuth \} from "@\/lib\/cron-auth";/);
    }
  });

  it("el aviso a entrenadoras no se programa: necesita cada 5 minutos (plan Pro)", () => {
    const paths = (config().crons as CronEntry[]).map((cron) => cron.path);
    expect(paths.some((path) => path.includes("coach-session-reminders"))).toBe(false);
  });

  it("keeps the deployment workflow credential-free and fail-closed", () => {
    const source = readFileSync(".github/workflows/deploy.yml", "utf8");
    const workflow = load(source);
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["deployment-locked"]);
    expect(workflow.jobs["deployment-locked"].steps).toHaveLength(1);
    expect(workflow.jobs["deployment-locked"].steps[0].run).toContain("exit 1");
    expect(source).not.toMatch(/secrets\.|vercel (deploy|build|pull)|uses:/);
  });
});
