import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FAMILY_ACCESS_TABLES } from "@/modules/family-access/application/family-access-storage";
import { OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES } from "@/modules/data-rights/application/catalog";

/**
 * Contrato del candidato SQL del acceso de familias y los avisos. Las tablas
 * no están en supabase/migrations: este test protege que el candidato, la
 * detección de almacenamiento y la clasificación de derechos de datos
 * coincidan, que las cuatro tablas fuercen RLS y retiren el acceso directo de
 * clientes, que el preflight aborte antes de crear nada y que el README
 * publique el SHA-256 exacto del archivo.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const CANDIDATE_FILE = "20261114120000_family_access_notices_candidate.sql";
const CANDIDATE = `docs/deployment/candidates/${CANDIDATE_FILE}`;
const TABLES = Object.keys(FAMILY_ACCESS_TABLES).sort();
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

function columnsOf(sql: string, table: string): string[] {
  const body = stripComments(sql);
  const start = body.indexOf(`create table zaltyko.${table} (`);
  expect(start, table).toBeGreaterThan(-1);
  let depth = 1;
  let index = start + `create table zaltyko.${table} (`.length;
  const from = index;
  while (depth > 0 && index < body.length) {
    if (body[index] === "(") depth += 1;
    if (body[index] === ")") depth -= 1;
    index += 1;
  }
  const items: string[] = [];
  let current = "";
  depth = 0;
  for (const char of body.slice(from, index - 1)) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      items.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items
    .filter((item) => !/^(unique|primary key|foreign key|check|constraint)\b/.test(item))
    .map((item) => item.split(/\s+/)[0]!)
    .sort();
}

describe("candidato SQL del acceso de familias y los avisos", () => {
  const sql = read(CANDIDATE);
  const lower = sql.toLowerCase();
  const body = stripComments(lower);

  it("se marca como pendiente de autorización y no está en el historial aplicable", () => {
    expect(lower).toContain("candidate only");
    expect(lower).toContain("requiere autorización de elvis");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_FILE))).toBe(false);
    for (const entry of readdirSync(join(ROOT, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${entry}`), entry).not.toMatch(/guardian_access_invitations|family_notices|family_notice_recipients|guardian_notification_preferences/);
    }
  });

  it("crea exactamente las cuatro tablas de la detección, con sus columnas", () => {
    const created = [...body.matchAll(/create table zaltyko\.([a-z_]+) \(/g)].map((match) => match[1]).sort();
    expect(created).toEqual(TABLES);
    for (const table of TABLES) {
      expect(columnsOf(sql, table), table).toEqual([...FAMILY_ACCESS_TABLES[table as keyof typeof FAMILY_ACCESS_TABLES]].sort());
    }
  });

  it("el preflight comprueba versión y ausencia antes de crear nada", () => {
    const firstCreate = body.indexOf("create table");
    const preflight = body.slice(0, firstCreate);
    expect(preflight).toContain("current_setting('server_version_num')::integer < 150000");
    for (const table of TABLES) expect(preflight).toContain(`to_regclass('zaltyko.${table}') is not null`);
    expect(preflight).toContain("raise exception 'family access candidate requires all four new relations absent");
  });

  it("fuerza RLS y retira el acceso de public, anon y authenticated en las cuatro tablas", () => {
    for (const table of TABLES) {
      expect(body).toContain(`alter table zaltyko.${table} enable row level security;`);
      expect(body).toContain(`alter table zaltyko.${table} force row level security;`);
    }
    const revoke = body.match(/revoke all on table ([\s\S]*?) from public, anon, authenticated;/);
    expect(revoke).not.toBeNull();
    for (const table of TABLES) expect(revoke![1]).toContain(`zaltyko.${table}`);
    expect(body).not.toMatch(/\bgrant\b/);
    expect(body).not.toMatch(/create policy/);
  });

  it("solo añade: no altera, borra ni rellena nada existente", () => {
    expect(body).not.toMatch(/\bdrop\b/);
    expect(body).not.toMatch(/\bdelete from\b/);
    expect(body).not.toMatch(/\binsert into\b/);
    expect(body).not.toMatch(/\bupdate zaltyko\./);
    expect(body).not.toMatch(/alter table zaltyko\.(?!guardian_access_invitations|family_notices|family_notice_recipients|guardian_notification_preferences)/);
  });

  it("guarda solo el hash del token, con forma de SHA-256", () => {
    expect(body).toContain("token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$')");
    expect(body).not.toMatch(/\btoken text\b/);
    expect(body).toContain("create unique index guardian_access_invitations_pending_uq");
  });

  it("toda tabla cuelga de la academia en cascada y nunca borra sesiones", () => {
    for (const table of TABLES) {
      expect(columnsOf(sql, table)).toContain("organization_id");
    }
    expect(body.match(/organization_id uuid not null references zaltyko\.organizations\(id\) on delete cascade/g)).toHaveLength(4);
    expect(body).toContain("foreign key (organization_id, session_id) references zaltyko.sessions(organization_id, id),");
    expect(body).not.toMatch(/references zaltyko\.sessions\(organization_id, id\) on delete/);
  });

  it("derechos de datos clasifica las mismas tablas y columnas, solo con recuentos", () => {
    expect(OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES.map((table) => table.table).sort()).toEqual(TABLES);
    for (const table of OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES) {
      expect([...table.columns].sort(), table.table).toEqual(columnsOf(sql, table.table));
      expect(table.reason).toContain("count");
    }
  });

  it("el README publica el archivo, la bandera y su SHA-256 exacto", () => {
    const readme = read("docs/deployment/candidates/README.md");
    const digest = createHash("sha256").update(readFileSync(join(ROOT, CANDIDATE))).digest("hex");
    expect(readme).toContain(CANDIDATE_FILE);
    expect(readme).toContain(digest);
    expect(readme).toContain("ZALTYKO_FAMILY_ACCESS_ENABLED");
    const section = readme.slice(readme.indexOf("## Candidato del acceso de familias"));
    expect(section.toLowerCase()).toContain("requiere autorización de elvis");
    expect(section).toContain("Rollback");
    expect(section).toContain("Verificación");
  });
});
