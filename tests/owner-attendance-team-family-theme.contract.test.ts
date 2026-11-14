import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Coherencia visual «Magnesio sobre tapiz» (PR-10a, PR-10b y PR-11 de la
 * auditoría del 2026-11-12): asistencia (también la home de la entrenadora),
 * inscripciones, solicitudes de prueba, equipo e invitaciones, y el portal de
 * familias con la solicitud pública de prueba.
 *
 * Estas pantallas escriben con los tokens del mundo (`mat`, `chalk`, `ochre`,
 * `signal`, `ramp`, `z-*` y `ownerUi`). Este contrato impide que vuelvan:
 * - las familias genéricas de Tailwind (`slate-400`, `amber-50`, `teal-800`…),
 *   que se pintan por alias y hacen que un error escrito en ámbar salga como
 *   aviso o que un aviso salga como error;
 * - las píldoras y los radios sueltos (`rounded-full`, `rounded-2xl`,
 *   `rounded-[12px]`…): chips de cinta de 6 px y radios del sistema;
 * - el negro, los alias `zaltyko-*`, los hexadecimales y el `letter-spacing`
 *   negativo (The Stretch Rule);
 * - los avisos en coral de `ownerUi.noticeWarning`/`chipAttention`: el aviso
 *   va en ocre (`ownerTone`), el coral queda para errores y deudas;
 * - los antetítulos decorativos (`ownerUi.eyebrow`) encima del título, como
 *   en la web (The Label Is Data Rule).
 */
const FILES = [
  "src/app/owner/attendance/page.tsx",
  "src/app/owner/enrollments/page.tsx",
  "src/app/owner/requests/page.tsx",
  "src/app/owner/staff/page.tsx",
  "src/components/owner-dashboard/OwnerAttendanceManager.tsx",
  "src/components/owner-dashboard/OwnerSessionPlanPanel.tsx",
  "src/components/owner-dashboard/OwnerSessionObservationForm.tsx",
  "src/components/owner-dashboard/OwnerSessionAthleteProgress.tsx",
  "src/components/owner-dashboard/OwnerSessionCoaches.tsx",
  "src/components/owner-dashboard/OwnerTodaySessionsPanel.tsx",
  "src/components/owner-dashboard/OwnerEnrollmentsManager.tsx",
  "src/components/owner-dashboard/OwnerEnrollmentList.tsx",
  "src/components/owner-dashboard/OwnerEnrollmentCreateForm.tsx",
  "src/components/owner-dashboard/owner-enrollment-ui.ts",
  "src/components/owner-dashboard/OwnerTrialRequestsWorkspace.tsx",
  "src/components/owner-dashboard/OwnerOperationalReadOnlyNotice.tsx",
  "src/components/owner-dashboard/OwnerStaffManager.tsx",
  "src/components/owner-dashboard/owner-tone-ui.ts",
  "src/components/owner-dashboard/OwnerPlanCheckNote.tsx",
  "src/components/owner/OwnerTeamAccessPanel.tsx",
  "src/components/family-portal/FamilyPortalShell.tsx",
  "src/components/family-portal/FamilyNoAccess.tsx",
  "src/app/familia/layout.tsx",
  "src/app/familia/page.tsx",
  "src/app/familia/cuotas/page.tsx",
  "src/app/familia/gimnastas/[athleteId]/page.tsx",
  "src/app/solicitar-prueba/[token]/page.tsx",
  "src/components/admissions/PublicTrialRequestForm.tsx",
] as const;

const sources = FILES.map((file) => ({ file, source: readFileSync(file, "utf8") }));

const GENERIC_FAMILIES =
  "gray|slate|zinc|neutral|stone|red|rose|pink|fuchsia|amber|yellow|orange|teal|emerald|green|cyan|sky|blue|indigo|violet|purple|lime";
const UTILITIES =
  "bg|text|border|border-[trblxy]|ring|outline|from|to|via|fill|stroke|divide|placeholder|decoration|accent|shadow|caret";

const FORBIDDEN: Array<[string, RegExp]> = [
  ["familia genérica de Tailwind", new RegExp(`\\b(?:${UTILITIES})-(?:${GENERIC_FAMILIES})-\\d{2,3}\\b`)],
  ["píldora (rounded-full)", /\brounded-full\b/],
  ["radio grande heredado", /\brounded-(?:2xl|3xl)\b/],
  ["radio arbitrario", /\brounded-\[/],
  ["negro", /\b(?:bg|text|border)-black\b/],
  ["alias zaltyko-*", /\b(?:bg|text|border|ring|outline)-zaltyko-/],
  ["hexadecimal suelto", /#[0-9A-Fa-f]{6}\b/],
  ["letter-spacing negativo", /\btracking-(?:tight|tighter|\[-)/],
  ["aviso en coral de ownerUi", /\bownerUi\.(?:noticeWarning|chipAttention)\b/],
  ["antetítulo decorativo", /\bownerUi\.eyebrow\b/],
];

describe("asistencia, inscripciones, solicitudes, equipo y familias en Magnesio", () => {
  it("existen todos los archivos vigilados", () => {
    expect(sources).toHaveLength(FILES.length);
    for (const { source } of sources) expect(source.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("no usan %s", (_label, pattern) => {
    const offenders = sources.flatMap(({ file, source }) =>
      source
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line, index }) => `${file}:${index + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});

describe("tonos de estado de estas pantallas", () => {
  const tone = readFileSync("src/components/owner-dashboard/owner-tone-ui.ts", "utf8");
  const entry = (name: string) => tone.match(new RegExp(`\\b${name}:\\s*([^\\n]+)`))?.[1] ?? "";

  it("el aviso va en ocre, nunca en coral", () => {
    for (const name of ["noticeWarning", "chipWarning", "inlineWarning"]) {
      expect(entry(name), name).toMatch(/ochre/);
      expect(entry(name), name).not.toMatch(/signal|chalk-\d|coral/);
    }
  });

  it("el error sigue en señal y lo activo en tapiz", () => {
    expect(entry("noticeError")).toBe("ownerUi.noticeError,");
    // Las clases pueden ir en cualquier orden (el módulo de tonos es común con #302).
    expect(entry("chipError")).toMatch(/\bbg-signal-wash\b/);
    expect(entry("chipError")).toMatch(/\btext-signal-ink\b/);
    expect(entry("inlineError")).toMatch(/text-signal-ink/);
    expect(entry("dangerButton")).toMatch(/bg-signal-ink/);
    expect(entry("dangerButton")).not.toMatch(/bg-signal\s/);
    expect(entry("chipActive")).toMatch(/bg-mat-wash text-mat-deep/);
    expect(entry("chipLive")).toMatch(/bg-mat-wash/);
  });

  it("los chips son de cinta (6 px), no píldoras", () => {
    for (const name of ["chipActive", "chipWarning", "chipError", "chipRest", "chipOutline", "chipLive"]) {
      expect(entry(name), name).toMatch(/rounded-md|\$\{CHIP\}/);
    }
    expect(tone).toMatch(/const CHIP = "[^"]*rounded-md[^"]*"/);
  });
});

describe("pestañas planas en lugar de botones principal/secundario", () => {
  it("el selector de sedes de la entrenadora marca la activa con cinta", () => {
    const page = readFileSync("src/app/owner/attendance/page.tsx", "utf8");
    const nav = page.slice(page.indexOf('aria-label="Sedes asignadas"'), page.indexOf("</nav>"));
    expect(nav).toContain("ownerTone.tabList");
    expect(nav).toContain("ownerTab(location.id === data.locationId)");
    expect(nav).not.toMatch(/primaryButton|secondaryButton/);
  });

  it("las solicitudes alternan pendientes y cerradas con pestañas", () => {
    const workspace = readFileSync("src/components/owner-dashboard/OwnerTrialRequestsWorkspace.tsx", "utf8");
    const tabs = workspace.slice(workspace.indexOf('role="tablist"'), workspace.indexOf("</div>", workspace.indexOf('role="tablist"')));
    expect(tabs).toContain("ownerTab(view === option)");
    expect(tabs).not.toMatch(/primaryButton|secondaryButton/);
  });

  it("la cinta de la pestaña activa es de 3 px en tapiz", () => {
    const tone = readFileSync("src/components/owner-dashboard/owner-tone-ui.ts", "utf8");
    expect(tone).toMatch(/tab: `[^`]*after:h-\[3px\][^`]*after:bg-mat/);
  });
});

describe("portal de familias y solicitud pública con la banda de tapiz", () => {
  it("la cabecera del portal es una banda de tapiz con el lockup y cinta blanca bajo la pestaña activa", () => {
    const shell = readFileSync("src/components/family-portal/FamilyPortalShell.tsx", "utf8");
    expect(shell).toContain("mat-field-deep");
    expect(shell).toContain("<ZaltykoLockup");
    expect(shell).toMatch(/h-\[3px\] bg-white/);
    expect(shell).toContain('aria-label="Portal de familias"');
    expect(shell).not.toMatch(/bg-z-brand-50/);
  });

  it("la solicitud pública de prueba lleva la misma banda y lockup", () => {
    const page = readFileSync("src/app/solicitar-prueba/[token]/page.tsx", "utf8");
    expect(page).toContain("mat-field-deep");
    expect(page).toContain("<ZaltykoLockup");
  });
});

describe("Quién entrena no repite su título en pantalla", () => {
  it("la leyenda del grupo de edición solo es para lectores de pantalla", () => {
    const coaches = readFileSync("src/components/owner-dashboard/OwnerSessionCoaches.tsx", "utf8");
    expect(coaches).toContain('<legend className="sr-only">Quién entrena en esta sesión</legend>');
    expect(coaches.match(/>\s*Quién entrena\s*</g)).toHaveLength(1);
  });
});

describe("cerrar sesión sobre la banda de tapiz del portal", () => {
  it("el portal pide la variante sobre tapiz y el error usa la tinta de señal clara", () => {
    const shell = readFileSync("src/components/family-portal/FamilyPortalShell.tsx", "utf8");
    const button = readFileSync("src/components/owner-dashboard/OwnerSignOutButton.tsx", "utf8");
    expect(shell).toContain('<OwnerSignOutButton surface="mat" />');
    expect(button).toMatch(/surface === "mat"\s*\?\s*"[^"]*text-signal-light/);
  });
});

describe("«Solo lectura» solo cuando el plan lo confirma", () => {
  it("Pasar lista pasa el estado de la comprobación a «Quién entrena» y al guion", () => {
    const manager = readFileSync("src/components/owner-dashboard/OwnerAttendanceManager.tsx", "utf8");
    expect(manager).toContain("const planCheck = ownerPlanCheckOf(planPolicy);");
    expect(manager.match(/planCheck=\{planCheck\}/g)).toHaveLength(2);
  });
});
