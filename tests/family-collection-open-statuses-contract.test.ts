import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas, Fase 4 (Tarea 4): `requires_action` es un estado
 * abierto en todas partes. Cada lista de «estados abiertos» es
 * FAMILY_COLLECTION_OPEN_STATUSES o una copia que este test compara con ella;
 * en el código no queda ninguna lista escrita a mano sin `requires_action`.
 * Además (C2), `action_deadline_at` solo se nombra en las consultas de la
 * forma "phase4": la Fase 3 (staging) nunca la lee ni la escribe. Y (N2) la
 * lista de facturas a cobrar deja fuera las que tienen un cobro tardío en
 * espera.
 * Solo lee archivos y constantes: ni base ni Stripe.
 */

const database = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));

vi.mock("@/db", () => ({ db: database }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: vi.fn(),
}));

import { AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES as LEDGER_IN_PROGRESS } from "@/modules/billing/application/ledger-service";
import { FAMILY_COLLECTION_OPEN_STATUSES } from "@/modules/family-collection/infrastructure/family-collection-schema";
import {
  createFamilyCollectionStore,
  LATE_SUCCESS_PENDING_REASON,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import { AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES as REMINDER_IN_PROGRESS } from "@/modules/payment-reminders/domain/reminder-policy";

const ROOT = process.cwd();
const OPEN = ["claimed", "created", "processing", "requires_action"];

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/**
 * La lista del índice de la Fase 3 tal como la imprime PostgreSQL
 * (FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE): describe la base de la Fase 3,
 * no decide qué está abierto. Es la única excepción.
 */
const ALLOWED = new Set(["src/modules/family-collection/application/storage.ts"]);

/** `claimed`, `created`, `processing` seguidos, con comillas simples o dobles y `::text` opcional. */
const LITERAL_OPEN_LIST = /(["'])claimed\1(?:::text)?\s*,\s*(["'])created\2(?:::text)?\s*,\s*(["'])processing\3/g;

describe("estados abiertos del cobro automático (Fase 4: requires_action)", () => {
  it("todas las copias de estados abiertos son FAMILY_COLLECTION_OPEN_STATUSES", () => {
    expect([...FAMILY_COLLECTION_OPEN_STATUSES]).toEqual(OPEN);
    // Copias que no pueden importar el espejo Drizzle (una política pura y el libro).
    expect([...REMINDER_IN_PROGRESS]).toEqual(OPEN);
    expect([...LEDGER_IN_PROGRESS]).toEqual(OPEN);
  });

  it("los que no tienen copia propia usan la constante", () => {
    for (const path of [
      "src/modules/family-collection/infrastructure/family-collection-store.ts",
      "src/modules/family-collection/application/family-collection-academy-actions.ts",
      "src/modules/family-collection/application/family-failure-notice-delivery.ts",
      "src/modules/family-collection/application/family-collection-reads.ts",
      "src/modules/family-collection/application/family-collection-events.ts",
    ]) {
      expect(read(path), path).toContain("FAMILY_COLLECTION_OPEN_STATUSES");
    }
  });

  it("en src/ y scripts/ no queda ninguna lista literal de estados abiertos sin requires_action", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "scripts"))]) {
      const path = relative(ROOT, file).split("\\").join("/");
      if (ALLOWED.has(path)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(LITERAL_OPEN_LIST)) {
        const after = text.slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 40);
        if (!after.includes("requires_action")) {
          const line = text.slice(0, match.index ?? 0).split("\n").length;
          offenders.push(`${path}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Trozo de `text` entre `start` (incluido) y el siguiente `end` (excluido). */
function region(text: string, start: string, end: string): { from: number; to: number } {
  const from = text.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return { from, to };
}

/** Posiciones de `action_deadline_at` en líneas de código (no comentarios). */
function codeOccurrences(text: string): number[] {
  const positions: number[] = [];
  let index = text.indexOf("action_deadline_at");
  while (index >= 0) {
    const lineStart = text.lastIndexOf("\n", index) + 1;
    const line = text.slice(lineStart, text.indexOf("\n", index)).trim();
    const comment = line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("--");
    if (!comment) positions.push(index);
    index = text.indexOf("action_deadline_at", index + 1);
  }
  return positions;
}

describe("C2: action_deadline_at solo con la forma phase4", () => {
  it("el almacén del cobro solo la nombra en readActionDeadline y en la escritura de requires_action", () => {
    const text = read("src/modules/family-collection/infrastructure/family-collection-store.ts");
    const columns = region(text, "const attemptColumns = sql`", "`;");
    expect(text.slice(columns.from, columns.to)).not.toContain("action_deadline_at");
    const reader = region(text, "async readActionDeadline(input) {", "\n    async ");
    const writer = region(text, 'if (outcome.kind === "requires_action") {', 'if (outcome.kind === "processing") {');
    const occurrences = codeOccurrences(text);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const position of occurrences) {
      const inside =
        (position > reader.from && position < reader.to) || (position > writer.from && position < writer.to);
      expect(inside, `action_deadline_at fuera de sitio en la posición ${position}`).toBe(true);
    }
  });

  it("el aviso a la familia solo la lee con la forma phase4 (authentication)", () => {
    const text = read("src/modules/family-collection/infrastructure/family-failure-notice-store.ts");
    const guarded = region(text, "const authentication = input.authentication === true;", "// Página siguiente");
    const occurrences = codeOccurrences(text);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const position of occurrences) {
      expect(position > guarded.from && position < guarded.to, `posición ${position}`).toBe(true);
    }
  });

  it("ningún otro archivo de la aplicación nombra action_deadline_at en su código", () => {
    const allowed = new Set([
      "src/modules/family-collection/infrastructure/family-collection-store.ts",
      "src/modules/family-collection/infrastructure/family-failure-notice-store.ts",
      // El espejo y la detección de la forma describen la columna; no la consultan.
      "src/modules/family-collection/infrastructure/family-collection-schema.ts",
      "src/modules/family-collection/application/storage.ts",
      // Catálogo de derechos de datos: la columna de la candidata posterior (Tarea 1).
      "src/modules/data-rights/application/catalog.ts",
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const path = relative(ROOT, file).split("\\").join("/");
      if (allowed.has(path)) continue;
      if (codeOccurrences(readFileSync(file, "utf8")).length > 0) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});

describe("N2: una factura con un cobro tardío en espera no se vuelve a cobrar", () => {
  it("listDueInvoices excluye la factura mientras el tardío tenga late_success_pending sin aviso de cierre; sin action_deadline_at", async () => {
    database.execute.mockReset();
    database.execute.mockResolvedValue({ rows: [] });

    await createFamilyCollectionStore().listDueInvoices({
      after: null,
      limit: 10,
      horizon: new Date("2026-11-21T00:00:00.000Z"),
      scope: null,
    });

    const query = new PgDialect().sqlToQuery(database.execute.mock.calls[0]![0] as SQL);
    const text = query.sql.replace(/\s+/g, " ");
    expect(text).toContain("and not exists ( select 1 from zaltyko.family_collection_attempts lp where lp.organization_id = i.organization_id and lp.invoice_id = i.id");
    expect(text).toContain("lp.status in ('failed', 'canceled')");
    expect(query.params).toEqual(
      expect.arrayContaining([
        `:needs_review:${LATE_SUCCESS_PENDING_REASON}`,
        ":needs_review:duplicate_collection",
        ":needs_review:amount_mismatch",
        ":needs_review:payment_recorded_for_other_attempt",
      ])
    );
    // Los estados abiertos, como parámetros: también requires_action.
    expect(query.params).toEqual(expect.arrayContaining([...FAMILY_COLLECTION_OPEN_STATUSES]));
    expect(text).not.toContain("action_deadline_at");
  });
});
