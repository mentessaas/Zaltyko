import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const SQL_PATH = "docs/deployment/scheduler/20261115_pg_cron_avisos.sql";

/** Avisos que lanza pg_cron en producción (ADR-0016, 2026-11-15). */
const SCHEDULED: Record<string, string> = {
  "coach-session-reminders": "*/5 * * * *",
  "family-notices": "*/10 * * * *",
  "owner-weekly-digest": "7 * * * *",
  "usage-at-risk": "0 7 * * *",
  "family-payment-reminders": "0 16 * * *",
};

describe("planificador de avisos en Supabase (pg_cron)", () => {
  const sqlText = read(SQL_PATH);

  it("el SQL documentado no contiene secretos", () => {
    expect(sqlText).not.toMatch(/[0-9a-f]{64}/i);
    expect(sqlText).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT
    expect(sqlText).not.toMatch(/sk_(live|test)_/);
    // El token solo puede venir de Vault, nunca escrito en el SQL.
    expect(sqlText).not.toMatch(/Bearer [A-Za-z0-9]/);
    expect(sqlText).toContain("vault.decrypted_secrets where name = 'zaltyko_cron_secret'");
    expect(sqlText).toContain("'Bearer ' || secret");
  });

  it("la función que llama a las rutas no está al alcance de anon ni authenticated", () => {
    expect(sqlText).toMatch(/security definer/);
    expect(sqlText).toMatch(/revoke all on function zaltyko_scheduler\.call_cron\(text\) from public, anon, authenticated;/);
    expect(sqlText).toMatch(/revoke all on schema zaltyko_scheduler from public, anon, authenticated;/);
    expect(sqlText).toContain("'https://zaltyko.com/api/cron/' || route");
  });

  it("programa exactamente los avisos autorizados", () => {
    const jobs = [...sqlText.matchAll(/cron\.schedule\('zaltyko-([a-z-]+)', '([^']+)', \$\$select zaltyko_scheduler\.call_cron\('([a-z-]+)'\)\$\$\)/g)];
    const scheduled = Object.fromEntries(
      jobs.map(([, job, schedule, route]) => {
        expect(job).toBe(route);
        return [route, schedule];
      })
    );
    expect(scheduled).toEqual(SCHEDULED);
  });

  it("cada ruta programada existe y exige el secreto antes de cualquier trabajo (pg_net llama por POST)", () => {
    for (const route of Object.keys(SCHEDULED)) {
      const file = `src/app/api/cron/${route}/route.ts`;
      expect(existsSync(join(ROOT, file)), file).toBe(true);
      const source = read(file);
      expect(source, file).toContain('import { requireCronAuth } from "@/lib/cron-auth";');
      expect(source, file).toMatch(
        /export async function POST\(request: Request\) \{\s*const authError = requireCronAuth\(request\);\s*if \(authError\) return authError;/
      );
    }
  });

  it("Vercel no programa nada: vercel.json sigue con crons vacío", () => {
    const vercel = JSON.parse(read("vercel.json"));
    expect(vercel.crons).toEqual([]);
    expect(vercel.git.deploymentEnabled).toBe(false);
  });
});
