import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ownerTone } from "@/components/owner-dashboard/owner-tone-ui";

/**
 * Contrato de coherencia visual de gimnastas, grupos y clases de /owner
 * (PR-8 y PR-9 de la auditoría de coherencia visual del 2026-11-12).
 *
 * Estas pantallas se escriben con los tokens del mundo «Magnesio sobre tapiz»
 * (`ownerUi`, `ownerTone`, `z-*`, `mat`, `chalk`, `signal`, `ochre`, `ramp`):
 * - sin familias genéricas de Tailwind (amber, red, gray, slate, sky…) ni
 *   alias `zaltyko-*`, que solo existen para pantallas heredadas;
 * - sin píldoras ni radios arbitrarios: chips de cinta de 6 px y radios del
 *   sistema;
 * - sin botones negros: principal en azul tapiz y peligro en tinta de señal;
 * - el aviso (pendiente, bloqueado, revisar) en ocre y el error en señal,
 *   nunca el aviso en coral.
 */
const FILES = [
  "src/app/owner/athletes/page.tsx",
  "src/app/owner/athletes/import/page.tsx",
  "src/app/owner/groups/page.tsx",
  "src/app/owner/classes/page.tsx",
  "src/components/owner-dashboard/owner-tone-ui.ts",
  "src/components/owner-dashboard/owner-groups-manager-model.ts",
  "src/components/owner-dashboard/OwnerAthleteIntakeWorkspace.tsx",
  "src/components/owner-dashboard/OwnerAthleteImportWorkspace.tsx",
  "src/components/owner-dashboard/OwnerAthleteProfileEditor.tsx",
  "src/components/owner-dashboard/OwnerAthleteArchiveEditor.tsx",
  "src/components/owner-dashboard/OwnerAthleteFamilyAssociationEditor.tsx",
  "src/components/owner-dashboard/OwnerGuardianContactsEditor.tsx",
  "src/components/owner-dashboard/OwnerGuardianProfileEditor.tsx",
  "src/components/owner-dashboard/OwnerAthleteProgressPanel.tsx",
  "src/components/owner-dashboard/OwnerGroupsManager.tsx",
  "src/components/owner-dashboard/OwnerGroupsRecoveryNotices.tsx",
  "src/components/owner-dashboard/OwnerGroupAthleteIntake.tsx",
  "src/components/owner-dashboard/OwnerGroupCreatePanel.tsx",
  "src/components/owner-dashboard/OwnerGroupMembershipRow.tsx",
  "src/components/owner-dashboard/OwnerGroupsSidebar.tsx",
  "src/components/owner-dashboard/OwnerClassesManager.tsx",
  "src/components/owner-dashboard/OwnerClassCoaches.tsx",
  "src/components/owner-dashboard/OwnerScheduleConflicts.tsx",
] as const;

const GENERIC_FAMILIES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "rose", "pink", "fuchsia",
  "amber", "yellow", "orange",
  "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
];
const UTILITIES = [
  "bg", "text", "border", "border-[trblxy]", "ring", "ring-offset", "outline", "divide", "fill", "stroke",
  "accent", "caret", "from", "via", "to", "placeholder", "decoration", "shadow",
];
const GENERIC_COLOR = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITIES.join("|")})-(?:${GENERIC_FAMILIES.join("|")})-\\d{2,3}\\b`,
  "g"
);

function source(path: string) {
  return readFileSync(path, "utf8");
}

function offenders(pattern: RegExp) {
  return FILES.flatMap((path) =>
    source(path)
      .split("\n")
      .flatMap((line, index) => (line.match(pattern) ?? []).map((hit) => `${path}:${index + 1} ${hit}`))
  );
}

describe("gimnastas, grupos y clases de /owner: tokens del mundo", () => {
  it("no escribe familias genéricas de Tailwind (amber, red, gray, slate, sky…)", () => {
    expect(offenders(GENERIC_COLOR)).toEqual([]);
  });

  it("no usa los alias heredados zaltyko-* ni hexadecimales sueltos", () => {
    expect(offenders(/(?<![\w-])(?:[a-z-]+:)*[a-z-]+-zaltyko-[\w-]+/g)).toEqual([]);
    expect(offenders(/className=[^\n]*#[0-9A-Fa-f]{3,8}\b/g)).toEqual([]);
  });

  it("no pinta píldoras ni radios arbitrarios o heredados", () => {
    expect(offenders(/\brounded-full\b/g)).toEqual([]);
    expect(offenders(/\brounded(?:-[trblse]{1,2})?-\[[^\]]+\]/g)).toEqual([]);
    expect(offenders(/\brounded-(?:2xl|3xl)\b/g)).toEqual([]);
    expect(offenders(/(?<![\w-])rounded(?=[\s"`])/g)).toEqual([]);
  });

  it("no usa botones negros: el principal es azul tapiz y el peligro, tinta de señal", () => {
    expect(offenders(/\b(?:hover:)?bg-black\b/g)).toEqual([]);
    expect(ownerTone.dangerButton).toContain("bg-signal-ink");
    expect(ownerTone.dangerButton).toContain("hover:bg-signal-800");
    expect(ownerTone.dangerButton).not.toMatch(/\bbg-signal(?:\s|$)/);
  });
});

describe("gimnastas, grupos y clases de /owner: tonos de estado", () => {
  it("el aviso es ocre (lavado, línea y tinta) y no coral", () => {
    expect(ownerTone.noticeWarning).toContain("bg-ochre-wash");
    expect(ownerTone.noticeWarning).toContain("border-ochre-line");
    expect(ownerTone.noticeWarning).toContain("text-ochre-ink");
    expect(ownerTone.noticeWarning).not.toMatch(/signal|z-chalk|amber/);
    expect(ownerTone.chipWarning).toContain("bg-ochre-wash");
    expect(ownerTone.warningText).toContain("text-ochre-ink");
  });

  it("el error va en señal", () => {
    expect(ownerTone.chipError).toContain("text-signal-ink");
    expect(ownerTone.errorText).toContain("text-signal-ink");
    expect(ownerTone.dangerOutlineButton).toContain("text-signal-ink");
  });

  it("los chips son de cinta (6 px), nunca píldoras", () => {
    for (const chip of [ownerTone.chipWarning, ownerTone.chipError, ownerTone.chipSuccess, ownerTone.chipOutline]) {
      expect(chip).toContain("rounded-md");
    }
  });

  it("no usa las claves de ownerUi que hoy pintan el aviso en coral", () => {
    // `ownerUi.noticeWarning` y `ownerUi.chipAttention` siguen en lavado de
    // señal hasta el PR-R; aquí el aviso va siempre por `ownerTone`.
    expect(offenders(/ownerUi\.(?:noticeWarning|chipAttention)\b/g)).toEqual([]);
  });

  it("los avisos de recuperación de grupos usan el tono de aviso", () => {
    const notices = source("src/components/owner-dashboard/OwnerGroupsRecoveryNotices.tsx");
    expect(notices.match(/ownerTone\.noticeWarning/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
  });

  it("la vista previa de importación usa tabla reglada y chips de resultado del sistema", () => {
    const importer = source("src/components/owner-dashboard/OwnerAthleteImportWorkspace.tsx");
    expect(importer).toContain("ownerTone.table");
    expect(importer).toContain("ownerTone.tableHeadCell");
    expect(importer).toMatch(/create: ownerTone\.chipSuccess/);
    expect(importer).toMatch(/error: ownerTone\.chipError/);
    expect(importer).toMatch(/duplicate: ownerTone\.chipWarning/);
    expect(ownerTone.table).toContain("border-t-[3px]");
  });
});
