import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";

/**
 * Panel del club (`/owner`) unificado (2026-11-14):
 * - un único módulo de tonos (`owner-ui.ts`), sin `owner-tone-ui.ts` ni
 *   `owner-form-tones.ts`;
 * - una sola cabecera de pantalla (`PageHeader`: título, descripción opcional
 *   y acciones), sin antetítulo ni nombre del club encima del título
 *   (The Label Is Data Rule);
 * - sin ámbar, amarillo, naranja ni rojo de Tailwind: avisos en ocre y
 *   errores en señal.
 */

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const OWNER_SOURCES = [
  ...listSources("src/app/owner"),
  ...listSources("src/components/owner-dashboard"),
  ...listSources("src/components/owner"),
].map((file) => ({ file, source: readFileSync(file, "utf8") }));

const ALL_SOURCES = listSources("src").map((file) => ({ file, source: readFileSync(file, "utf8") }));

/** Pantallas cuya cabecera es `PageHeader` (título h1 incluido). */
const PAGE_HEADER_SCREENS = [
  "src/app/owner/error.tsx",
  "src/app/owner/payments/page.tsx",
  "src/app/owner/setup/page.tsx",
  "src/app/owner/setup/preview/page.tsx",
  "src/app/owner/health-score/setup/preview/page.tsx",
  "src/components/owner-dashboard/OwnerAthleteIntakeWorkspace.tsx",
  "src/components/owner-dashboard/OwnerAthleteImportWorkspace.tsx",
  "src/components/owner-dashboard/OwnerAttendanceManager.tsx",
  "src/components/owner-dashboard/OwnerCalendarView.tsx",
  "src/components/owner-dashboard/OwnerClassesManager.tsx",
  "src/components/owner-dashboard/OwnerEnrollmentsManager.tsx",
  "src/components/owner-dashboard/OwnerGroupsManager.tsx",
  "src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx",
  "src/components/owner-dashboard/OwnerSaasBillingManager.tsx",
  "src/components/owner-dashboard/OwnerStaffManager.tsx",
  "src/components/owner-dashboard/OwnerTrialRequestsWorkspace.tsx",
  "src/app/familia/page.tsx",
  "src/app/familia/cuotas/page.tsx",
  "src/app/familia/gimnastas/[athleteId]/page.tsx",
] as const;

describe("owner-ui.ts es el único origen de los tonos de /owner", () => {
  it("los módulos de tonos antiguos ya no existen ni se importan", () => {
    expect(existsSync("src/components/owner-dashboard/owner-tone-ui.ts")).toBe(false);
    expect(existsSync("src/components/owner-dashboard/owner-form-tones.ts")).toBe(false);
    const importers = ALL_SOURCES.filter(({ source }) => /owner-tone-ui|owner-form-tones/.test(source)).map(
      ({ file }) => file
    );
    expect(importers).toEqual([]);
  });

  it("ownerUi no ofrece antetítulo ni título propio: la cabecera es PageHeader", () => {
    expect(Object.keys(ownerUi)).not.toContain("eyebrow");
    expect(Object.keys(ownerUi)).not.toContain("pageTitle");
    expect(Object.keys(ownerUi)).not.toContain("pageLead");
  });
});

describe("una sola cabecera de pantalla en /owner", () => {
  it.each(PAGE_HEADER_SCREENS)("%s usa PageHeader y no escribe su propio h1", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('import { PageHeader } from "@/components/ui/page-header";');
    expect(source.match(/<PageHeader\b/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(source).not.toMatch(/<h1\b/);
  });

  it("ninguna pantalla de /owner pone un antetítulo encima del título", () => {
    const offenders = OWNER_SOURCES.filter(({ source }) => /\bownerUi\.eyebrow\b/.test(source)).map(
      ({ file }) => file
    );
    expect(offenders).toEqual([]);
  });
});

describe("tonos de /owner sin ámbar, amarillo, naranja ni rojo de Tailwind", () => {
  it("avisos en ocre y errores en señal", () => {
    const pattern = /\b(?:amber|yellow|orange|red)-\d{2,3}\b/;
    const offenders = OWNER_SOURCES.flatMap(({ file, source }) =>
      source
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line, index }) => `${file}:${index + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
