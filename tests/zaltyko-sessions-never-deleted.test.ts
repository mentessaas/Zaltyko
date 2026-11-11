import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ningún flujo borra filas de `zaltyko.sessions`: una sesión se cancela por
 * estado, nunca se elimina. Las observaciones de gimnastas (P2 #17) apuntan a
 * sesiones con una FK NO ACTION a propósito, porque un `set null` compuesto
 * anularía también `organization_id` y `location_id`. Esta prueba convierte el
 * comentario del candidato en un contrato: si alguien añade un borrado de
 * sesiones, falla y obliga a decidir antes el comportamiento de la FK
 * (`on delete set null (session_id)`, PostgreSQL 15+).
 *
 * Fuera de alcance, a propósito:
 * - Borrar una academia elimina en cascada sus sesiones y sus observaciones
 *   en la misma sentencia, así que la FK NO ACTION no lo bloquea.
 * - `tests/` no es un flujo de la aplicación.
 */

const ROOT = process.cwd();
const ROOTS = ["src", "scripts", "supabase", "docs/deployment/candidates"];
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs|sql)$/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

/** Módulos que exportan la tabla canónica `sessions` (barril y esquema). */
const CANONICAL_SCHEMA = /^(?:@\/db\/zaltyko-schema|@\/db\/schema\/zaltyko-core|(?:\.\.?\/)+(?:db\/)?(?:zaltyko-schema|schema\/zaltyko-core|zaltyko-core))$/;

/**
 * Nombres con los que un fichero ve la tabla canónica: `sessions`, sus alias
 * (`sessions as s`) y los espacios de nombres (`import * as z` → `z.sessions`).
 */
function sessionTableNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!CANONICAL_SCHEMA.test(match[2])) continue;
    for (const part of match[1].split(",")) {
      const binding = part.trim().match(/^sessions(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (binding) names.push(binding[1] ?? "sessions");
    }
  }
  for (const match of source.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["']([^"']+)["']/g)) {
    if (CANONICAL_SCHEMA.test(match[2])) names.push(`${match[1]}.sessions`);
  }
  return names;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Borrados de `zaltyko.sessions` en un fichero: Drizzle, SQL crudo o plantillas sql. */
function sessionDeletes(source: string): string[] {
  const findings: string[] = [];
  // SQL crudo, cualificado o no (con search_path = zaltyko también es la tabla canónica).
  const table = String.raw`(?:only\s+)?(?:"?zaltyko"?\s*\.\s*)?"?sessions"?(?![\w$-])`;
  const raw = [
    new RegExp(String.raw`\bdelete\s+from\s+${table}`, "gi"),
    new RegExp(String.raw`\btruncate\s+(?:table\s+)?(?:[\w".]+\s*,\s*)*${table}`, "gi"),
  ];
  for (const pattern of raw) {
    for (const match of source.matchAll(pattern)) findings.push(match[0].replace(/\s+/g, " "));
  }
  for (const name of sessionTableNames(source)) {
    const ref = escape(name);
    for (const pattern of [
      new RegExp(String.raw`\.delete\(\s*${ref}\s*\)`, "g"),
      new RegExp(String.raw`\bdelete\s+from\s+\$\{\s*${ref}\s*\}`, "gi"),
      new RegExp(String.raw`\btruncate\s+(?:table\s+)?\$\{\s*${ref}\s*\}`, "gi"),
    ]) {
      for (const match of source.matchAll(pattern)) findings.push(match[0].replace(/\s+/g, " "));
    }
  }
  return findings;
}

describe("zaltyko.sessions nunca se borra", () => {
  const sources = ROOTS.flatMap((root) => files(join(ROOT, root))).map((file) =>
    relative(ROOT, file).split(sep).join("/")
  );

  it("recorre el código, los scripts, las migraciones y los candidatos SQL", () => {
    expect(sources.some((file) => file.startsWith("src/modules/"))).toBe(true);
    expect(sources.some((file) => file.startsWith("scripts/"))).toBe(true);
    expect(sources.some((file) => file.startsWith("supabase/migrations/") && file.endsWith(".sql"))).toBe(true);
    expect(sources).toContain("docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql");
    // El detector ve la tabla canónica donde de verdad se usa.
    expect(sessionTableNames(readFileSync(join(ROOT, "src/modules/attendance/application/attendance-service.ts"), "utf8"))).toContain(
      "sessions"
    );
  });

  it("ningún fichero contiene un borrado de sesiones", () => {
    const violations = sources.flatMap((file) =>
      sessionDeletes(readFileSync(join(ROOT, file), "utf8")).map((finding) => `${file}: ${finding}`)
    );
    expect(violations).toEqual([]);
  });

  it("la FK de observaciones a sesiones sigue en NO ACTION y documentada", () => {
    const candidate = readFileSync(
      join(ROOT, "docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql"),
      "utf8"
    );
    const fk = candidate.match(/foreign key \(organization_id, location_id, session_id\) references [^\n]*/)![0];
    expect(fk).not.toMatch(/on delete/i);
    expect(candidate).toContain("ningún flujo borra sesiones");
  });

  it("reconoce las formas de borrado y no confunde otras tablas", () => {
    const drizzle = `import { sessions, sessionStaff } from "@/db/zaltyko-schema";\nawait tx.delete(sessions).where(x);\nawait tx.delete(sessionStaff);\n`;
    const aliased = `import { sessions as zSessions } from "@/db/schema/zaltyko-core";\nawait db.delete( zSessions );\n`;
    const namespace = `import * as schema from "@/db/zaltyko-schema";\nawait tx.delete(schema.sessions);\n`;
    const template = `import { sessions } from "@/db/zaltyko-schema";\nawait tx.execute(sql\`delete from \${sessions} where id = \${id}\`);\n`;
    const legacy = `import { sessions } from "@/db/schema/legacy-sessions";\nawait db.delete(sessions);\n`;
    expect(sessionDeletes(drizzle)).toEqual([".delete(sessions)"]);
    expect(sessionDeletes(aliased)).toEqual([".delete( zSessions )"]);
    expect(sessionDeletes(namespace)).toEqual([".delete(schema.sessions)"]);
    expect(sessionDeletes(template)).toEqual(["delete from ${sessions}"]);
    expect(sessionDeletes(legacy)).toEqual([]);
    expect(sessionDeletes("DELETE FROM zaltyko.sessions WHERE id = $1;")).toHaveLength(1);
    expect(sessionDeletes('delete from only "zaltyko"."sessions" where true;')).toHaveLength(1);
    expect(sessionDeletes("set search_path = zaltyko;\ndelete from sessions;")).toHaveLength(1);
    expect(sessionDeletes("truncate table zaltyko.attendance_records, zaltyko.sessions cascade;")).toHaveLength(1);
    for (const harmless of [
      "delete from zaltyko.session_staff where session_id = $1;",
      "delete from zaltyko.sessions_archive;",
      "delete from public.class_sessions where id = $1;",
      "update zaltyko.sessions set status = 'cancelled' where id = $1;",
      "-- ningún flujo borra sesiones",
    ]) {
      expect(sessionDeletes(harmless), harmless).toEqual([]);
    }
  });
});
