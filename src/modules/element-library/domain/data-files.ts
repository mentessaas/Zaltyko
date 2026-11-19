import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { z } from "zod";

import {
  type BatchRecord,
  batchRecordSchema,
  type EditionFile,
  editionsFileSchema,
  type ElementDataFile,
  elementDataFileSchema,
} from "./element-library";

/**
 * Lectura de los archivos de datos revisados de la biblioteca (ADR-0029 §1.5).
 * Solo para tests, scripts y servidor: lee del disco relativo a la raíz del
 * repositorio (`process.cwd()` por defecto) y valida con los esquemas zod.
 *
 * - `data/editions.json`: ediciones.
 * - `data/<edición>/<aparato>.json`: elementos de un aparato.
 * - `data/<edición>/tandas/<n>.json`: registro de cada tanda.
 */

export const ELEMENT_DATA_DIR = "src/modules/element-library/data";
const EDITIONS_FILE = "editions.json";
const BATCH_DIR = "tandas";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: JSON no válido (${error instanceof Error ? error.message : String(error)})`);
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, path: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.map(String).join(".") || "(raíz)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${path}: ${issues}`);
  }
  return result.data;
}

function dataDir(root: string): string {
  return join(root, ELEMENT_DATA_DIR);
}

/** Directorios de edición presentes en `data/`, en orden. */
function editionDirs(root: string): string[] {
  const dir = dataDir(root);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadEditionFiles(root: string = process.cwd()): EditionFile[] {
  const path = join(dataDir(root), EDITIONS_FILE);
  return parseOrThrow(editionsFileSchema, readJson(path), path);
}

function editionByDir(editions: readonly EditionFile[], dirName: string): EditionFile {
  const edition = editions.find((candidate) => candidate.code === dirName);
  if (!edition) {
    throw new Error(`${join(ELEMENT_DATA_DIR, dirName)}: la edición no está en ${EDITIONS_FILE}`);
  }
  return edition;
}

/**
 * Lee y valida `data/<edición>/*.json`. Falla si el archivo no se llama como
 * su aparato, si su edición no coincide con la carpeta o no está en
 * `editions.json`, si una clave se repite dentro de la edición o si un grupo no
 * existe en la edición para ese aparato. Orden: edición y aparato.
 */
export function loadElementDataFiles(root: string = process.cwd()): ElementDataFile[] {
  const editions = loadEditionFiles(root);
  const files: ElementDataFile[] = [];

  for (const dirName of editionDirs(root)) {
    const edition = editionByDir(editions, dirName);
    const dir = join(dataDir(root), dirName);
    const seenKeys = new Map<string, string>();

    const names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();

    for (const name of names) {
      const relative = join(ELEMENT_DATA_DIR, dirName, name);
      const file = parseOrThrow(elementDataFileSchema, readJson(join(dir, name)), relative);
      if (file.edition !== edition.code) {
        throw new Error(`${relative}: la edición ${file.edition} no coincide con la carpeta ${dirName}`);
      }
      if (name !== `${file.apparatus}.json`) {
        throw new Error(`${relative}: el archivo debe llamarse ${file.apparatus}.json`);
      }
      const groupKeys = new Set((edition.groups[file.apparatus] ?? []).map((group) => group.key));
      for (const element of file.elements) {
        const previous = seenKeys.get(element.elementKey);
        if (previous) {
          throw new Error(`${relative}: la clave ${element.elementKey} ya está en ${previous}`);
        }
        seenKeys.set(element.elementKey, name);
        if (!groupKeys.has(element.group)) {
          throw new Error(
            `${relative}: el grupo ${element.group} de ${element.elementKey} no está en ${EDITIONS_FILE} para ${file.apparatus}`
          );
        }
      }
      files.push(file);
    }
  }

  return files;
}

/** Lee y valida `data/<edición>/tandas/<n>.json`. Orden: edición y número de tanda. */
export function loadBatchRecords(root: string = process.cwd()): BatchRecord[] {
  const editions = loadEditionFiles(root);
  const records: BatchRecord[] = [];

  for (const dirName of editionDirs(root)) {
    const edition = editionByDir(editions, dirName);
    const dir = join(dataDir(root), dirName, BATCH_DIR);
    if (!existsSync(dir)) continue;

    const names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);

    const editionRecords = names.map((name) => {
      const relative = join(ELEMENT_DATA_DIR, dirName, BATCH_DIR, name);
      const record = parseOrThrow(batchRecordSchema, readJson(join(dir, name)), relative);
      if (record.edition !== edition.code) {
        throw new Error(`${relative}: la edición ${record.edition} no coincide con la carpeta ${dirName}`);
      }
      if (name !== `${record.batch}.json`) {
        throw new Error(`${relative}: el archivo debe llamarse ${record.batch}.json`);
      }
      return record;
    });

    records.push(...editionRecords.sort((a, b) => a.batch - b.batch));
  }

  return records;
}
