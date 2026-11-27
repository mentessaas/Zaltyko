import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { USAGE_EVENT_NAMES } from "@/modules/habitual-use/domain/usage";

/**
 * ADR-0029 §11: el evento de consulta a la biblioteca (`element_library_view`)
 * tiene su propia candidata pequeña, que solo amplía
 * `usage_events_event_name_check`. Sin ella la biblioteca funciona sin contar.
 */

const ROOT = process.cwd();
const CANDIDATE_NAME = "20261119121500_element_library_usage_event_candidate.sql";
const CANDIDATE_PATH = `docs/deployment/candidates/${CANDIDATE_NAME}`;
const HABITUAL_USE_PATH = "docs/deployment/candidates/20261114130000_habitual_use_candidate.sql";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const sql = read(CANDIDATE_PATH);
const code = sql.replace(/--[^\n]*/g, "").toLowerCase();

function at(fragment: string): number {
  const index = code.indexOf(fragment);
  expect(index, fragment).toBeGreaterThanOrEqual(0);
  return index;
}

/** Nombres de una lista `('a', 'b')` en el orden en que aparecen. */
const namesIn = (list: string) => [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

/** Forma con la que PostgreSQL escribe `check (event_name in (…))` en pg_get_constraintdef. */
const rendered = (names: string[]) =>
  `CHECK ((event_name = ANY (ARRAY[${names.map((name) => `'${name}'::text`).join(", ")}])))`;

/** Bloque de vuelta atrás comentado, sin los `-- `. */
function rollbackBlock(text: string): string {
  const match = /^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m.exec(text);
  if (!match) throw new Error("La candidata no tiene bloque de vuelta atrás");
  return match[1]!
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      if (!line.startsWith("-- ")) throw new Error(`Línea de vuelta atrás sin comentar: ${line}`);
      return line.slice(3);
    })
    .join("\n");
}

describe("candidata del evento de consulta a la biblioteca", () => {
  it("es solo candidata, fuera de supabase/migrations y documentada como no aplicada", () => {
    expect(sql).toContain("CANDIDATE ONLY");
    expect(sql).toContain("No aplicado en ningún entorno");
    expect(sql).toContain("ADR-0029 §11");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_NAME))).toBe(false);
  });

  it("abre y cierra su propia transacción, con lock_timeout antes de nada", () => {
    expect(code.trimStart().startsWith("begin;")).toBe(true);
    expect(code.trimEnd().endsWith("commit;")).toBe(true);
    expect(at("set local lock_timeout = '5s';")).toBeLessThan(at("do $element_library_usage_event_candidate_preflight$"));
  });

  it("el preflight aborta si falta public.usage_events, antes de tocar nada", () => {
    expect(code).toMatch(/if to_regclass\('public\.usage_events'\) is null then\s+raise exception/);
    expect(at("to_regclass('public.usage_events') is null")).toBeLessThan(at("alter table"));
  });

  it("el preflight exige la restricción exacta que instala la candidata del uso habitual", () => {
    const habitual = read(HABITUAL_USE_PATH);
    const original = /constraint usage_events_event_name_check\s+check \(event_name in \(([^)]*)\)\)/.exec(habitual);
    expect(original).not.toBeNull();
    expect(namesIn(original![1]!)).toEqual(["staff_visit", "family_portal_view"]);
    // El literal SQL del preflight, con sus comillas dobladas.
    const literal = `'${rendered(namesIn(original![1]!)).replace(/'/g, "''")}'`;
    expect(sql).toContain(`) is distinct from ${literal} then`);
    expect(code).toMatch(
      /select pg_get_constraintdef\(oid\)\s+from pg_constraint\s+where conrelid = to_regclass\('public\.usage_events'\)\s+and conname = 'usage_events_event_name_check'\s+and contype = 'c'/
    );
    expect(at("is distinct from")).toBeLessThan(at("alter table"));
  });

  it("solo cambia la restricción de tipos de evento, con los nombres del dominio", () => {
    const body = code.slice(code.indexOf("$element_library_usage_event_candidate_preflight$;") + 1);
    const alter = /alter table public\.usage_events\s+drop constraint usage_events_event_name_check,\s+add constraint usage_events_event_name_check\s+check \(event_name in \(([^)]*)\)\);/.exec(
      body
    );
    expect(alter).not.toBeNull();
    expect(namesIn(alter![1]!)).toEqual([...USAGE_EVENT_NAMES]);
    expect(namesIn(alter![1]!)).toEqual(["staff_visit", "family_portal_view", "element_library_view"]);
    // Una sola sentencia de cambio, sin tocar la regla de rol ni filas.
    expect(code.match(/alter table/g)).toHaveLength(1);
    expect(code).not.toContain("usage_events_role_event_check");
    expect(code).not.toMatch(/\b(?:insert|update|delete|truncate|create|grant)\b/);
    expect(code).not.toMatch(/\bcascade\b/);
  });

  it("la vuelta atrás va comentada y deja la restricción como la instaló el uso habitual", () => {
    const rollback = rollbackBlock(sql).toLowerCase();
    expect(code).not.toContain("delete from public.usage_events");
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("set local lock_timeout = '5s';");
    // Primero se van los contadores nuevos: el check antiguo no los aceptaría.
    const removal = rollback.indexOf("delete from public.usage_events where event_name = 'element_library_view';");
    expect(removal).toBeGreaterThanOrEqual(0);
    const restored = /drop constraint usage_events_event_name_check,\s+add constraint usage_events_event_name_check\s+check \(event_name in \(([^)]*)\)\);/.exec(
      rollback
    );
    expect(restored).not.toBeNull();
    expect(removal).toBeLessThan(restored!.index);
    expect(namesIn(restored![1]!)).toEqual(["staff_visit", "family_portal_view"]);
  });

  it("figura en el README de candidatas con su SHA-256 y aplicada en producción", () => {
    const readme = read("docs/deployment/candidates/README.md");
    const hash = createHash("sha256").update(readFileSync(join(ROOT, CANDIDATE_PATH))).digest("hex");
    const row = readme.split("\n").find((line) => line.includes(`\`${CANDIDATE_NAME}\``));
    expect(row).toBeDefined();
    expect(row).toContain(hash);
    expect(row).toContain("Aplicada 27-11-2026");
    const section = readme.slice(readme.indexOf(row!));
    expect(section).toContain("en producción el 27-11-2026");
  });
});
