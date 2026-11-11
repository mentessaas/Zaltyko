import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { athleteObservations } from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";

/**
 * Ningún flujo borra filas de `zaltyko.sessions`: una sesión se cancela por
 * estado, nunca se elimina. Las observaciones de gimnastas (P2 #17) apuntan a
 * sesiones con una FK NO ACTION a propósito, porque un `set null` compuesto
 * anularía también `organization_id` y `location_id`. Esta prueba convierte el
 * comentario del candidato en un contrato: si alguien añade un borrado de
 * sesiones, falla y obliga a decidir antes el comportamiento de la FK
 * (`on delete set null (session_id)`, PostgreSQL 15+).
 *
 * Qué detecta:
 * - SQL crudo (`delete from` y `truncate`, con o sin `zaltyko.`, `only` o
 *   comillas) en cualquier fichero: TS/JS, .sql, .sh y .py.
 * - Drizzle `.delete(<tabla>)` y plantillas sql`delete from ${<tabla>}`, donde
 *   <tabla> es la tabla canónica tal como la ve cada fichero: importada del
 *   esquema o de cualquier módulo que la reexporte (`export *`,
 *   `export { … } from`, `export { … }` y `export const x = …` locales), con
 *   alias (`sessions as s`), espacios de nombres (`schema.sessions`) y
 *   asignaciones (`const t = sessions`).
 * - supabase-js `.schema("zaltyko").from("sessions")….delete()`, y
 *   `.from("sessions")….delete()` en ficheros que configuran `schema: "zaltyko"`.
 *
 * Límites conocidos (el detector es léxico, no un análisis de tipos): no sigue
 * la tabla por desestructuración (`const { sessions: t } = schema`), por
 * parámetros de función, por acceso dinámico (`schema["sessions"]`) ni por SQL
 * construido concatenando cadenas.
 *
 * Fuera de alcance, a propósito: borrar una academia elimina en cascada sus
 * sesiones y sus observaciones en la misma sentencia, así que la FK no lo
 * bloquea; y `tests/` no es un flujo de la aplicación.
 */

const ROOT = process.cwd();
const ROOTS = ["src", "scripts", "supabase", "drizzle", "mobile", "docs/deployment/candidates"];
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs|sql|sh|py)$/;
const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const IDENT = String.raw`[A-Za-z_$][\w$]*`;

type Sources = Map<string, string>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function resolveModule(sources: Sources, from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = posix.normalize(posix.join(posix.dirname(from), specifier));
  } else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`]) {
    if (sources.has(candidate)) return candidate;
  }
  return null;
}

/** `a as b, type c` → [["a", "b"], ["c", "c"]]. */
function bindings(list: string): Array<[string, string]> {
  return list
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, ""))
    .map((part) => part.match(new RegExp(`^(${IDENT})(?:\\s+as\\s+(${IDENT}))?$`)))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2] ?? match[1]]);
}

/** Tablas `sessions` definidas en el esquema `zaltyko` dentro de este fichero. */
function definedSessionTables(source: string): string[] {
  const schemas = [...source.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*pgSchema\\(\\s*["']zaltyko["']\\s*\\)`, "g"))].map(
    (match) => match[1]
  );
  return schemas.flatMap((schema) =>
    [...source.matchAll(new RegExp(`export\\s+const\\s+(${IDENT})\\s*=\\s*${escape(schema)}\\s*\\.\\s*table\\(\\s*["']sessions["']`, "g"))].map(
      (match) => match[1]
    )
  );
}

/** Nombres con los que un fichero ve la tabla canónica. */
function localSessionNames(sources: Sources, exportsByFile: Map<string, Set<string>>, file: string): Set<string> {
  const source = sources.get(file)!;
  const names = new Set(definedSessionTables(source));
  for (const match of source.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const exported = exportsByFile.get(resolveModule(sources, file, match[2]) ?? "");
    if (!exported) continue;
    for (const [imported, local] of bindings(match[1])) if (exported.has(imported)) names.add(local);
  }
  for (const match of source.matchAll(new RegExp(`import\\s*\\*\\s*as\\s+(${IDENT})\\s*from\\s*["']([^"']+)["']`, "g"))) {
    for (const name of exportsByFile.get(resolveModule(sources, file, match[2]) ?? "") ?? []) {
      names.add(`${match[1]}.${name}`);
    }
  }
  // Asignaciones: const t = sessions; let u = t; const v = schema.sessions.
  const assignment = new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*(?::[^=;]+)?=\\s*(${IDENT}(?:\\.${IDENT})?)\\s*(?=[;,)\\n])`, "g");
  for (let changed = true; changed; ) {
    changed = false;
    for (const match of source.matchAll(assignment)) {
      if (names.has(match[2]) && !names.has(match[1])) {
        names.add(match[1]);
        changed = true;
      }
    }
  }
  return names;
}

/** Para cada módulo, los nombres exportados que son la tabla canónica (punto fijo). */
function sessionExports(sources: Sources): Map<string, Set<string>> {
  const exportsByFile = new Map<string, Set<string>>();
  const code = [...sources.keys()].filter((file) => CODE.test(file));
  const add = (file: string, name: string) => {
    const set = exportsByFile.get(file) ?? new Set<string>();
    if (set.has(name)) return false;
    exportsByFile.set(file, set.add(name));
    return true;
  };
  for (const file of code) for (const name of definedSessionTables(sources.get(file)!)) add(file, name);
  for (let changed = true, rounds = 0; changed && rounds < 20; rounds += 1) {
    changed = false;
    for (const file of code) {
      const source = sources.get(file)!;
      if (!source.includes("export")) continue;
      for (const match of source.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
        for (const name of exportsByFile.get(resolveModule(sources, file, match[1]) ?? "") ?? []) changed = add(file, name) || changed;
      }
      for (const match of source.matchAll(/export\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
        const exported = exportsByFile.get(resolveModule(sources, file, match[2]) ?? "");
        for (const [name, as] of bindings(match[1])) if (exported?.has(name)) changed = add(file, as) || changed;
      }
      const local = localSessionNames(sources, exportsByFile, file);
      for (const match of source.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
        for (const [name, as] of bindings(match[1])) if (local.has(name)) changed = add(file, as) || changed;
      }
      for (const match of source.matchAll(new RegExp(`export\\s+const\\s+(${IDENT})\\s*=\\s*(${IDENT}(?:\\.${IDENT})?)\\s*(?=[;\\n])`, "g"))) {
        if (local.has(match[2])) changed = add(file, match[1]) || changed;
      }
    }
  }
  return exportsByFile;
}

const normalize = (text: string) => text.replace(/\s+/g, " ");

/** Borrados de `zaltyko.sessions` en un fichero, dados los nombres que ve de la tabla. */
function deletesInSource(source: string, names: Iterable<string>): string[] {
  const findings: string[] = [];
  const table = String.raw`(?:only\s+)?(?:"?zaltyko"?\s*\.\s*)?"?sessions"?(?![\w$-])`;
  const patterns = [
    new RegExp(String.raw`\bdelete\s+from\s+${table}`, "gi"),
    new RegExp(String.raw`\btruncate\s+(?:table\s+)?(?:[\w".]+\s*,\s*)*${table}`, "gi"),
    // supabase-js con el esquema zaltyko explícito en la cadena.
    /\.schema\(\s*(["'`])zaltyko\1\s*\)\s*\.from\(\s*(["'`])sessions\2\s*\)[^;]*?\.delete\(/g,
  ];
  // Cliente creado con { db: { schema: "zaltyko" } }: cualquier .from("sessions") es la tabla canónica.
  if (/\bschema\s*:\s*(["'`])zaltyko\1/.test(source)) {
    patterns.push(/\.from\(\s*(["'`])sessions\1\s*\)[^;]*?\.delete\(/g);
  }
  for (const name of names) {
    const ref = escape(name);
    patterns.push(
      new RegExp(String.raw`\.delete\(\s*${ref}\s*\)`, "g"),
      new RegExp(String.raw`\bdelete\s+from\s+\$\{\s*${ref}\s*\}`, "gi"),
      new RegExp(String.raw`\btruncate\s+(?:table\s+)?\$\{\s*${ref}\s*\}`, "gi")
    );
  }
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) findings.push(normalize(match[0]));
  }
  return [...new Set(findings)];
}

/** Hallazgos por fichero en un conjunto de fuentes (repositorio o ejemplo sintético). */
function sessionDeletes(sources: Sources): string[] {
  const exportsByFile = sessionExports(sources);
  return [...sources.keys()].flatMap((file) => {
    const names = CODE.test(file) ? localSessionNames(sources, exportsByFile, file) : [];
    return deletesInSource(sources.get(file)!, names).map((finding) => `${file}: ${finding}`);
  });
}

/** La cláusula completa de la FK, aunque ocupe varias líneas, hasta la coma o el cierre. */
function sessionForeignKeyClause(sql: string): string {
  const match = sql.match(/foreign key \(organization_id, location_id, session_id\)[\s\S]*?(?=,[ \t]*(?:--[^\n]*)?\n|\n\);)/i);
  if (!match) throw new Error("No se encuentra la FK de observaciones a sesiones");
  return match[0];
}

const CORE = `import { pgSchema } from "drizzle-orm/pg-core";\nexport const zaltyko = pgSchema("zaltyko");\nexport const sessions = zaltyko.table(\n  "sessions",\n  {}\n);\nexport const sessionStaff = zaltyko.table("session_staff", {});\n`;

function sample(files: Record<string, string>): Sources {
  return new Map(
    Object.entries({
      "src/db/schema/zaltyko-core.ts": CORE,
      "src/db/zaltyko-schema.ts": `export * from "./schema/zaltyko-core";\n`,
      ...files,
    })
  );
}

describe("zaltyko.sessions nunca se borra", () => {
  const files = ROOTS.flatMap((root) => walk(join(ROOT, root))).map((file) => relative(ROOT, file).split(sep).join("/"));
  const sources: Sources = new Map(files.map((file) => [file, readFileSync(join(ROOT, file), "utf8")]));

  it("recorre código, scripts (.sh, .py), migraciones, drizzle/, mobile/ y candidatos", () => {
    expect(files.some((file) => file.startsWith("src/modules/"))).toBe(true);
    expect(files.some((file) => file.startsWith("scripts/") && file.endsWith(".sh"))).toBe(true);
    expect(files.some((file) => file.startsWith("scripts/") && file.endsWith(".py"))).toBe(true);
    expect(files.some((file) => file.startsWith("supabase/migrations/") && file.endsWith(".sql"))).toBe(true);
    expect(files.some((file) => file.startsWith("drizzle/"))).toBe(true);
    expect(files.some((file) => file.startsWith("mobile/"))).toBe(true);
    expect(files.some((file) => file.includes("node_modules"))).toBe(false);
    expect(files).toContain("docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql");
  });

  it("sigue la tabla canónica por el esquema, el barril y quienes la usan", () => {
    const exportsByFile = sessionExports(sources);
    expect([...(exportsByFile.get("src/db/schema/zaltyko-core.ts") ?? [])]).toContain("sessions");
    expect([...(exportsByFile.get("src/db/zaltyko-schema.ts") ?? [])]).toContain("sessions");
    expect(localSessionNames(sources, exportsByFile, "src/modules/attendance/application/attendance-service.ts").has("sessions")).toBe(true);
  });

  it("ningún fichero contiene un borrado de sesiones", () => {
    expect(sessionDeletes(sources)).toEqual([]);
  });

  it("la FK de observaciones a sesiones sigue en NO ACTION en el candidato y en el espejo Drizzle", () => {
    const candidate = readFileSync(
      join(ROOT, "docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql"),
      "utf8"
    );
    const clause = sessionForeignKeyClause(candidate);
    expect(clause).toContain("references zaltyko.sessions(organization_id, location_id, id)");
    expect(clause).not.toMatch(/\bon\s+(delete|update)\b/i);
    expect(candidate).toContain("ningún flujo borra sesiones");

    const sessionFks = getTableConfig(athleteObservations).foreignKeys.filter((fk) =>
      fk.reference().columns.some((column) => column.name === "session_id")
    );
    expect(sessionFks).toHaveLength(1);
    expect(getTableConfig(sessionFks[0].reference().foreignTable).name).toBe("sessions");
    expect(sessionFks[0].onDelete ?? "no action").toBe("no action");
    expect(sessionFks[0].onUpdate ?? "no action").toBe("no action");
  });

  it("la extracción de la FK no deja escapar un ON DELETE en otra línea", () => {
    const multiline = `  foreign key (organization_id, location_id, session_id) references zaltyko.sessions(organization_id, location_id, id)\n    on delete set null (session_id),\n  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id)\n);`;
    expect(sessionForeignKeyClause(multiline)).toMatch(/on delete set null/);
    const last = `  foreign key (organization_id, location_id, session_id)\n    references zaltyko.sessions(organization_id, location_id, id)\n    on delete cascade\n);`;
    expect(sessionForeignKeyClause(last)).toMatch(/on delete cascade/);
  });

  it("reconoce los borrados por import, alias, espacio de nombres, asignación y reexportación", () => {
    const findings = sessionDeletes(
      sample({
        "src/a.ts": `import { sessions, sessionStaff } from "@/db/zaltyko-schema";\nawait tx.delete(sessions).where(x);\nawait tx.delete(sessionStaff);\n`,
        "src/b.ts": `import { sessions as zSessions } from "@/db/schema/zaltyko-core";\nawait db.delete( zSessions );\n`,
        "src/c.ts": `import * as schema from "@/db/zaltyko-schema";\nawait tx.delete(schema.sessions);\n`,
        "src/d.ts": `import { sessions } from "@/db/zaltyko-schema";\nawait tx.execute(sql\`delete from \${sessions} where id = \${id}\`);\n`,
        "src/e.ts": `import { sessions } from "../src/db/zaltyko-schema";\nconst table = sessions;\nconst again = table;\nawait tx.delete(again);\n`,
        "src/lib/tables.ts": `export { sessions as canonicalSessions } from "@/db/zaltyko-schema";\n`,
        "src/lib/barrel.ts": `export * from "./tables";\n`,
        "src/f.ts": `import { canonicalSessions } from "@/lib/barrel";\nawait tx.delete(canonicalSessions);\n`,
        "src/lib/local.ts": `import { sessions } from "@/db/zaltyko-schema";\nexport const operational = sessions;\nexport { sessions as plain };\n`,
        "src/g.ts": `import { operational, plain } from "./lib/local";\nawait tx.delete(operational);\nawait db.delete(plain);\n`,
        "src/h.ts": `const supabase = createClient(url, key);\nawait supabase.schema("zaltyko").from("sessions").delete().eq("id", id);\n`,
        "src/i.ts": `const supabase = createClient(url, key, { db: { schema: "zaltyko" } });\nawait supabase.from('sessions')\n  .delete()\n  .eq("id", id);\n`,
        "scripts/purge.sh": `psql "$URL" -c "DELETE FROM zaltyko.sessions WHERE id = '$ID'"\n`,
        "scripts/purge.py": `cur.execute("truncate table zaltyko.attendance_records, zaltyko.sessions cascade")\n`,
      })
    );
    expect(findings).toEqual([
      "src/a.ts: .delete(sessions)",
      "src/b.ts: .delete( zSessions )",
      "src/c.ts: .delete(schema.sessions)",
      "src/d.ts: delete from ${sessions}",
      "src/e.ts: .delete(again)",
      "src/f.ts: .delete(canonicalSessions)",
      "src/g.ts: .delete(operational)",
      "src/g.ts: .delete(plain)",
      `src/h.ts: .schema("zaltyko").from("sessions").delete(`,
      `src/i.ts: .from('sessions') .delete(`,
      "scripts/purge.sh: DELETE FROM zaltyko.sessions",
      "scripts/purge.py: truncate table zaltyko.attendance_records, zaltyko.sessions",
    ]);
  });

  it("no confunde otras tablas, otros esquemas ni otras tablas sessions", () => {
    const harmless = [
      "delete from zaltyko.session_staff where session_id = $1;",
      "delete from zaltyko.sessions_archive;",
      "delete from public.class_sessions where id = $1;",
      "delete from auth.sessions where user_id = $1;",
      "delete from public.sessions where id = $1;",
      'delete from "auth"."sessions";',
      "update zaltyko.sessions set status = 'cancelled' where id = $1;",
      "-- ningún flujo borra sesiones",
    ];
    for (const sql of harmless) expect(deletesInSource(sql, []), sql).toEqual([]);
    expect(
      sessionDeletes(
        sample({
          "src/legacy.ts": `import { sessions } from "@/db/schema/legacy-sessions";\nawait db.delete(sessions);\n`,
          "src/db/schema/legacy-sessions.ts": `export const sessions = pgTable("sessions", {});\n`,
          "src/auth.ts": `await supabase.schema("auth").from("sessions").delete().eq("id", id);\n`,
          "src/public.ts": `await supabase.from("sessions").delete().eq("id", id);\n`,
          "src/staff.ts": `import { sessionStaff } from "@/db/zaltyko-schema";\nconst t = sessionStaff;\nawait tx.delete(t);\n`,
        })
      )
    ).toEqual([]);
  });
});
