import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-0029 §7: retirada de las tablas antiguas de elementos y de las
 * puntuaciones por elemento. El código deja de usarlas y una candidata aparte,
 * sin aplicar, las borra solo si están vacías.
 */

const ROOT = process.cwd();
const CANDIDATE_NAME = "20261119122000_retire_legacy_skill_catalog_candidate.sql";
const CANDIDATE_PATH = `docs/deployment/candidates/${CANDIDATE_NAME}`;
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const sql = read(CANDIDATE_PATH);
const code = sql.replace(/--[^\n]*/g, "").toLowerCase();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

function at(fragment: string): number {
  const index = code.indexOf(fragment);
  expect(index, fragment).toBeGreaterThanOrEqual(0);
  return index;
}

describe("candidata de borrado de las tablas antiguas de elementos", () => {
  it("es solo candidata, fuera de supabase/migrations y documentada como no aplicada", () => {
    expect(sql).toContain("CANDIDATE ONLY");
    expect(sql).toContain("No aplicado en");
    expect(sql).toContain("ADR-0029 §7");
    expect(existsSync(join(ROOT, "supabase/migrations", CANDIDATE_NAME))).toBe(false);
  });

  it("abre y cierra su propia transacción", () => {
    expect(code.trimStart().startsWith("begin;")).toBe(true);
    expect(code.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("exige la confirmación de la sesión antes de cualquier otra cosa", () => {
    const confirmation = at("current_setting('zaltyko.retire_legacy_skill_catalog', true)");
    expect(code).toContain("<> 'confirmado'");
    expect(confirmation).toBeLessThan(at("to_regclass('public.assessment_scores') is null"));
    expect(confirmation).toBeLessThan(at("lock table public.assessment_scores"));
    expect(sql).toContain("set local zaltyko.retire_legacy_skill_catalog = 'confirmado'");
  });

  it("aborta si no existe ninguna de las tres tablas", () => {
    expect(code).toMatch(
      /to_regclass\('public\.assessment_scores'\) is null\s+and to_regclass\('public\.athlete_skills'\) is null\s+and to_regclass\('public\.skill_catalog'\) is null then\s+raise exception/
    );
  });

  it("bloquea y cuenta las filas de cada tabla antes de borrar, y aborta con el recuento", () => {
    for (const table of ["assessment_scores", "athlete_skills", "skill_catalog"]) {
      const lock = at(`lock table public.${table} in access exclusive mode`);
      const count = at(`select count(*) from public.${table}`);
      expect(lock, `${table}: bloqueo antes del recuento`).toBeLessThan(count);
      expect(count, `${table}: recuento antes de cualquier drop`).toBeLessThan(at("drop table"));
    }
    const abort = at("if v_assessment_scores > 0 or v_athlete_skills > 0 or v_skill_catalog > 0 then");
    expect(code.slice(abort)).toMatch(
      /^if [^;]+ then\s+raise exception\s+'hay filas[^']*assessment_scores=%, athlete_skills=%, skill_catalog=%',\s+v_assessment_scores, v_athlete_skills, v_skill_catalog/
    );
    expect(abort).toBeLessThan(at("drop table"));
  });

  it("borra en el orden de las claves foráneas y sin cascade", () => {
    const drops = [...code.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([a-z_.]+)\s*;/g)].map((match) => match[1]);
    expect(drops).toEqual(["public.assessment_scores", "public.athlete_skills", "public.skill_catalog"]);
    expect(code).not.toMatch(/\bcascade\b/);
    expect(code).not.toMatch(/athlete_assessments|assessment_videos/);
  });

  it("la cabecera trae el recuento por tabla y academia, de solo lectura, y qué hacer si aborta", () => {
    const header = sql.slice(0, sql.indexOf("begin;"));
    expect(header).toContain("Recuento previo por tabla y academia");
    expect(header).toMatch(/group by s\.tenant_id, aa\.academy_id/);
    expect(header).toMatch(/group by tenant_id, academy_id/);
    expect(header).toContain("ADR-0029 §7.4");
    expect(header).toContain("no se ha borrado nada");
    const start = header.indexOf("Recuento previo por tabla y academia");
    const query = header
      .slice(start, header.indexOf("\n--\n", start))
      .split("\n")
      .filter((line) => /^--\s{3}/.test(line))
      .join("\n")
      .toLowerCase();
    expect(query).toContain("select 'assessment_scores'");
    expect(query).not.toMatch(/\b(?:insert|update|delete|drop|alter|truncate)\b/);
  });

  it("figura en el README de candidatas con su SHA-256 y sin aplicar", () => {
    const readme = read("docs/deployment/candidates/README.md");
    const hash = createHash("sha256").update(readFileSync(join(ROOT, CANDIDATE_PATH))).digest("hex");
    const row = readme.split("\n").find((line) => line.includes(`\`${CANDIDATE_NAME}\``));
    expect(row).toBeDefined();
    expect(row).toContain(hash);
    expect(row).toContain("No aplicada");
    const section = readme.slice(readme.indexOf(row!));
    expect(section).toContain("No se ha aplicado en ningún entorno");
  });
});

describe("el código ya no usa las tablas antiguas", () => {
  it("se borraron el formulario antiguo y las semillas de elementos", () => {
    for (const path of [
      "src/components/assessment-form.tsx",
      "src/db/seeds/templates/espana-ga-elements.ts",
      "src/db/seeds/templates/espana-gr-elements.ts",
    ]) {
      expect(existsSync(join(ROOT, path)), path).toBe(false);
    }
  });

  it("la semilla general y el catálogo de trazas no las nombran", () => {
    const seed = read("scripts/seed.ts");
    expect(seed).not.toMatch(/seedSkillCatalog|skillCatalog|ElementsSeed|seedEspanaG[AR]Elements|-elements"/);
    expect(seed).toContain("await seedEspanaGR();");
    expect(seed).toContain("await seedEspanaGA();");
    const traces = read("scripts/lib/local-build-trace-catalog.ts");
    expect(traces).not.toContain("src/components/assessment-form.tsx");
    expect(traces).not.toContain("espana-ga-elements.ts");
    expect(traces).not.toContain("espana-gr-elements.ts");
    expect(read("src/db/seeds/templates/README.md")).not.toMatch(/skillCatalog|-elements\.ts`?\s+#/);
  });

  it("ningún archivo de src fuera de los espejos Drizzle las importa", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const rel = relative(ROOT, file);
      // Los espejos Drizzle se conservan hasta aplicar la candidata SQL.
      if (rel.startsWith("src/db/schema/")) continue;
      if (/\b(?:assessmentScores|skillCatalog|athleteSkills)\b|assessment_scores|skill_catalog|athlete_skills/.test(readFileSync(file, "utf8"))) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
