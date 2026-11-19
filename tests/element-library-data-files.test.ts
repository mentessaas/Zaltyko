import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ELEMENT_DATA_DIR,
  loadBatchRecords,
  loadEditionFiles,
  loadElementDataFiles,
} from "@/modules/element-library/domain/data-files";
import { ELEMENT_DATA_NOTICE, type ElementRecord } from "@/modules/element-library/domain/element-library";
import { ELEMENT_SEED_FILE_PATTERN, renderElementSeedSql } from "@/modules/element-library/domain/seed-sql";

/**
 * Los archivos de datos de la biblioteca son la fuente de verdad (ADR-0029
 * §1.5): este test exige que cada semilla candidata sea exactamente lo que
 * genera scripts/element-library/build-seed.ts, que cada tanda tenga su
 * registro y su semilla, y que no haya URL de terceros ni marcas ajenas.
 * Funciona igual sin ningún archivo de elementos ni semilla.
 */

const ROOT = process.cwd();
const CANDIDATES_DIR = "docs/deployment/candidates";
const FORBIDDEN = ["youtube", "http", "upgradegymnastics", "gympro"];

const editions = loadEditionFiles();
const files = loadElementDataFiles();
const batches = loadBatchRecords();

const seedFiles = readdirSync(join(ROOT, CANDIDATES_DIR))
  .filter((name) => name.includes("_element_catalog_seed_"))
  .sort();

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Claves por tanda: "<edición>#<tanda>" → claves y aparatos. */
function elementsByBatch() {
  const map = new Map<string, { edition: string; batch: number; keys: string[]; apparatus: Set<string> }>();
  for (const file of files) {
    for (const element of file.elements) {
      const id = `${file.edition}#${element.batch}`;
      const entry = map.get(id) ?? { edition: file.edition, batch: element.batch, keys: [], apparatus: new Set<string>() };
      entry.keys.push(element.elementKey);
      entry.apparatus.add(file.apparatus);
      map.set(id, entry);
    }
  }
  return map;
}

describe("data/editions.json", () => {
  it("solo la edición GAF 2025-2028, publicada, con los grupos de salto", () => {
    expect(editions).toHaveLength(1);
    const [wag] = editions;
    expect(wag).toMatchObject({
      code: "fig-wag-2025-2028",
      discipline: "artistic_female",
      cycleStart: 2025,
      cycleEnd: 2028,
      title: "Código de Puntuación de Gimnasia Artística Femenina 2025-2028",
      documentUrl: "https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20WAG%20COP%202025-2028.pdf",
      coverDate: "2026-10-14",
      status: "published",
    });
    expect(wag.groups.vault).toEqual([
      { key: "1", label: "Sin mortal: paloma, Yamashita y rondada" },
      { key: "2", label: "Paloma y mortal" },
      { key: "3", label: "Tsukahara: paloma con 1/4–1/2 giro y mortal atrás" },
      { key: "4", label: "Yurchenko: rondada y mortal atrás" },
      { key: "5", label: "Rondada con 1/2 giro y mortal adelante" },
    ]);
  });
});

describe("semillas candidatas", () => {
  it("cada semilla se llama como debe y coincide con lo que genera el script", () => {
    for (const name of seedFiles) {
      const match = ELEMENT_SEED_FILE_PATTERN.exec(name);
      expect(match, name).not.toBeNull();
      if (!match) continue;
      const [, , code, batchText] = match;
      const edition = editions.find((candidate) => candidate.code === code);
      expect(edition, `${name}: edición en editions.json`).toBeDefined();
      if (!edition) continue;
      const expected = renderElementSeedSql(
        edition,
        files.filter((file) => file.edition === code),
        Number(batchText)
      );
      expect(readFileSync(join(ROOT, CANDIDATES_DIR, name), "utf8"), `${name}: regenera con el script`).toBe(expected);
    }
  });

  it("una sola semilla por tanda y ninguna tanda con elementos sin semilla", () => {
    const seeded = seedFiles.map((name) => {
      const match = ELEMENT_SEED_FILE_PATTERN.exec(name);
      return match ? `${match[2]}#${match[3]}` : name;
    });
    expect(new Set(seeded).size).toBe(seeded.length);
    for (const id of elementsByBatch().keys()) {
      expect(seeded, `semilla de ${id}`).toContain(id);
    }
  });
});

describe("registros de tanda", () => {
  it("cada tanda con elementos tiene su tandas/<n>.json válido con las mismas claves y aparatos", () => {
    const byBatch = elementsByBatch();
    for (const [id, entry] of byBatch) {
      const record = batches.find((candidate) => candidate.edition === entry.edition && candidate.batch === entry.batch);
      expect(record, `registro de ${id}`).toBeDefined();
      if (!record) continue;
      expect([...record.elementKeys].sort(), id).toEqual([...entry.keys].sort());
      expect([...record.apparatus].sort(), id).toEqual([...entry.apparatus].sort());
    }
    for (const record of batches) {
      expect(byBatch.has(`${record.edition}#${record.batch}`), `elementos de la tanda ${record.batch}`).toBe(true);
    }
  });
});

describe("sin URL de terceros ni marcas ajenas", () => {
  it("ni en los datos ni en las semillas (salvo el enlace oficial de la edición)", () => {
    const paths = [
      ...listFiles(join(ROOT, ELEMENT_DATA_DIR)),
      ...seedFiles.map((name) => join(ROOT, CANDIDATES_DIR, name)),
    ];
    for (const path of paths) {
      let text = readFileSync(path, "utf8");
      for (const edition of editions) text = text.split(edition.documentUrl).join("");
      const lower = text.toLowerCase();
      for (const word of FORBIDDEN) {
        expect(lower.includes(word), `${path} contiene «${word}»`).toBe(false);
      }
    }
  });
});

describe("lectura de archivos", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  const element = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
    elementKey: "vt_test_one",
    group: "1",
    valuePoints: 2.4,
    name: "Elemento de prueba",
    shortName: "Prueba",
    sourcePage: 1,
    sourceCheckedOn: "2026-11-19",
    draftedBy: "Claude",
    draftedOn: "2026-11-19",
    batch: 1,
    reviewStatus: "draft",
    ...overrides,
  });

  function fixture(dataFiles: Record<string, unknown>): string {
    root = mkdtempSync(join(tmpdir(), "element-library-"));
    const dataDir = join(root, ELEMENT_DATA_DIR);
    mkdirSync(join(dataDir, "fig-wag-2025-2028"), { recursive: true });
    writeFileSync(join(dataDir, "editions.json"), readFileSync(join(ROOT, ELEMENT_DATA_DIR, "editions.json")));
    for (const [name, content] of Object.entries(dataFiles)) {
      writeFileSync(join(dataDir, "fig-wag-2025-2028", name), JSON.stringify(content));
    }
    return root;
  }

  const vault = (elements: ElementRecord[]) => ({
    aviso: ELEMENT_DATA_NOTICE,
    edition: "fig-wag-2025-2028",
    apparatus: "vault",
    elements,
  });

  it("lee un archivo válido y una carpeta sin elementos", () => {
    expect(loadElementDataFiles(fixture({}))).toEqual([]);
    rmSync(root!, { recursive: true, force: true });
    expect(loadElementDataFiles(fixture({ "vault.json": vault([element()]) }))).toHaveLength(1);
  });

  it("falla con un grupo que no está en editions.json", () => {
    expect(() => loadElementDataFiles(fixture({ "vault.json": vault([element({ group: "9" })]) }))).toThrow(/grupo 9/);
  });

  it("falla con una clave repetida en la edición", () => {
    expect(() => loadElementDataFiles(fixture({ "vault.json": vault([element(), element()]) }))).toThrow();
  });

  it("falla si el archivo no se llama como su aparato o la carpeta no es una edición", () => {
    expect(() => loadElementDataFiles(fixture({ "salto.json": vault([element()]) }))).toThrow(/vault\.json/);
    const withUnknownEdition = fixture({});
    mkdirSync(join(withUnknownEdition, ELEMENT_DATA_DIR, "fig-xyz-2025-2028"));
    expect(() => loadElementDataFiles(withUnknownEdition)).toThrow(/editions\.json/);
  });
});
