import type { EditionFile, ElementDataFile } from "../../src/modules/element-library/domain/element-library";

/**
 * Genera la semilla SQL candidata de una tanda de la biblioteca de elementos
 * (ADR-0029 §1.5) a partir de los archivos de datos revisados.
 *
 *   node --experimental-strip-types scripts/element-library/build-seed.ts <edición> <tanda> [prefijo]
 *
 * Desde la raíz del repositorio. No es un build ni un test y no necesita
 * node_modules: solo lee `src/modules/element-library/data/` y escribe
 * `docs/deployment/candidates/<prefijo>_element_catalog_seed_<edición>_<tanda>.sql`.
 * Si ya existe una semilla de esa tanda la reescribe con su mismo nombre; si
 * no, usa `prefijo` (14 dígitos) o la fecha y hora UTC actuales. No aplica
 * nada en ninguna base de datos.
 *
 * La validación completa (zod) la hace tests/element-library-data-files.test.ts;
 * aquí solo hay comprobaciones de forma. El archivo es CommonJS (el paquete lo
 * es) y por eso usa `require`; `seed-sql.ts` es un módulo ES sin dependencias,
 * así que se le quitan los tipos con Node y se importa como módulo en memoria.
 */

const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const nodeModule = require("node:module") as { stripTypeScriptTypes?: (code: string) => string };

type SeedSqlModule = typeof import("../../src/modules/element-library/domain/seed-sql");

const DATA_DIR = "src/modules/element-library/data";
const SEED_SQL = "src/modules/element-library/domain/seed-sql.ts";
const CANDIDATES_DIR = "docs/deployment/candidates";

function fail(message: string): never {
  throw new Error(message);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadSeedSql(root: string): Promise<SeedSqlModule> {
  if (typeof nodeModule.stripTypeScriptTypes !== "function") {
    fail("Hace falta Node 22.13 o posterior (module.stripTypeScriptTypes).");
  }
  const source = nodeModule.stripTypeScriptTypes(fs.readFileSync(path.join(root, SEED_SQL), "utf8"));
  const url = `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
  return (await import(url)) as SeedSqlModule;
}

function loadEdition(root: string, code: string): EditionFile {
  const editions = readJson(path.join(root, DATA_DIR, "editions.json"));
  if (!Array.isArray(editions)) fail("editions.json debe ser una lista");
  const edition = editions.find((candidate: unknown) => isRecord(candidate) && candidate.code === code);
  if (!isRecord(edition)) fail(`La edición ${code} no está en editions.json`);
  return edition as EditionFile;
}

function loadFiles(root: string, code: string): ElementDataFile[] {
  const dir = path.join(root, DATA_DIR, code);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const file = readJson(path.join(dir, name));
      if (!isRecord(file) || file.edition !== code || typeof file.apparatus !== "string" || !Array.isArray(file.elements)) {
        fail(`${path.join(DATA_DIR, code, name)}: forma no válida`);
      }
      if (name !== `${file.apparatus}.json`) fail(`${path.join(DATA_DIR, code, name)}: debe llamarse ${file.apparatus}.json`);
      return file as ElementDataFile;
    });
}

function utcPrefix(now: Date): string {
  return now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

async function main(): Promise<void> {
  const [code, batchArg, prefixArg] = process.argv.slice(2);
  if (!code || !batchArg) {
    fail("Uso: node --experimental-strip-types scripts/element-library/build-seed.ts <edición> <tanda> [prefijo]");
  }
  if (!/^[1-9]\d*$/.test(batchArg)) fail(`Tanda no válida: ${batchArg}`);
  if (prefixArg !== undefined && !/^\d{14}$/.test(prefixArg)) fail(`Prefijo no válido (14 dígitos): ${prefixArg}`);
  const batch = Number(batchArg);

  const root = process.cwd();
  if (!fs.existsSync(path.join(root, DATA_DIR, "editions.json"))) {
    fail("Ejecuta el script desde la raíz del repositorio.");
  }

  const seedSql = await loadSeedSql(root);
  const sql = seedSql.renderElementSeedSql(loadEdition(root, code), loadFiles(root, code), batch);

  const suffix = seedSql.elementSeedFileSuffix(code, batch);
  const candidatesDir = path.join(root, CANDIDATES_DIR);
  const existing = fs
    .readdirSync(candidatesDir)
    .filter((name) => seedSql.ELEMENT_SEED_FILE_PATTERN.test(name) && name.endsWith(suffix));
  if (existing.length > 1) fail(`Hay más de una semilla para la tanda ${batch} de ${code}: ${existing.join(", ")}`);
  const fileName = existing[0] ?? `${prefixArg ?? utcPrefix(new Date())}${suffix}`;

  const target = path.join(candidatesDir, fileName);
  fs.writeFileSync(target, sql, "utf8");
  console.log(`Semilla candidata escrita: ${path.join(CANDIDATES_DIR, fileName)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
