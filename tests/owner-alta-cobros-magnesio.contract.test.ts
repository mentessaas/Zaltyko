import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrato de coherencia visual del alta de academia (`/owner/setup`, PR-5) y
 * de los cobros de `/owner` (`/owner/payments`, `/owner/monthly-invoices`,
 * PR-6) de la auditoría de 2026-11-12. Estas pantallas usan la familia
 * compartida (`components/ui` y `ownerUi`): sin botones negros, sin píldoras,
 * sin radios sueltos y sin familias genéricas de Tailwind. Los avisos van en
 * ocre y los errores en señal (DESIGN.md, «Tonos de estado»).
 */

const FILES = [
  "src/app/owner/setup/page.tsx",
  "src/app/owner/setup/preview/page.tsx",
  "src/components/owner-dashboard/OwnerSetupForm.tsx",
  "src/app/owner/payments/page.tsx",
  "src/app/owner/monthly-invoices/page.tsx",
  "src/components/owner-dashboard/ManualPaymentForm.tsx",
  "src/components/owner-dashboard/ManualPaymentFormFields.tsx",
  "src/components/owner-dashboard/ManualPaymentNotices.tsx",
  "src/components/owner-dashboard/OwnerMonthlyInvoicesManager.tsx",
  "src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx",
  "src/components/owner-dashboard/OwnerMonthlyInvoiceResolutionPanel.tsx",
  "src/components/owner-dashboard/OwnerMonthlyResolutionFamilyFields.tsx",
  "src/components/owner-dashboard/OwnerMonthlyResolutionTariffFields.tsx",
  "src/components/owner-dashboard/OwnerMonthlyResolutionNotices.tsx",
  "src/components/owner-dashboard/FamilyCollectionModeCard.tsx",
  "src/components/owner-dashboard/owner-monthly-resolution-model.ts",
  "src/components/owner-dashboard/owner-form-tones.ts",
] as const;

const read = (path: string) => readFileSync(path, "utf8");

/** Clases candidatas del archivo, sin variantes (`hover:`, `sm:`, `has-[…]:`…). */
function classTokens(source: string): string[] {
  return source
    .split(/[\s"'`{}()<>,;=]+/)
    .filter(Boolean)
    .map((token) => token.split(/:(?![^[]*\])/).pop() ?? token)
    .map((token) => token.replace(/^[!-]+/, ""));
}

const GENERIC_FAMILIES =
  "black|amber|yellow|orange|red|rose|pink|fuchsia|emerald|green|lime|teal|cyan|sky|blue|indigo|violet|purple|gray|slate|zinc|neutral|stone";
const GENERIC_COLOR = new RegExp(
  `^(?:bg|text|border(?:-[trblxyse])?|outline|ring|ring-offset|divide|from|via|to|accent|fill|stroke|decoration|placeholder|shadow|caret)-(?:${GENERIC_FAMILIES})(?:-|/|$)`
);

describe("alta de academia y cobros de /owner: familia de componentes Magnesio", () => {
  it.each(FILES)("%s no usa negro, ámbar/amarillo/naranja ni familias genéricas de Tailwind", (path) => {
    const offenders = classTokens(read(path)).filter((token) =>
      GENERIC_COLOR.test(token)
    );
    expect(offenders).toEqual([]);
  });

  it.each(FILES)("%s no usa píldoras, radios sueltos ni tracking negativo", (path) => {
    const offenders = classTokens(read(path)).filter(
      (token) =>
        token === "rounded-full" ||
        token === "rounded-2xl" ||
        token === "rounded-3xl" ||
        token.startsWith("rounded-[") ||
        token.startsWith("tracking-[-") ||
        token === "shadow-soft"
    );
    expect(offenders).toEqual([]);
  });

  it.each(FILES)("%s no pinta avisos con el tono de error heredado de ownerUi", (path) => {
    // `ownerUi.noticeWarning` y los `z-chalk-*` siguen en lavado de señal
    // hasta el PR-R: aquí un aviso va en ocre (`ownerNoticeAviso`).
    const source = read(path);
    expect(source).not.toContain("ownerUi.noticeWarning");
    expect(source).not.toMatch(/\bz-chalk-/);
  });

  it("el aviso es ocre y el campo es el de components/ui", () => {
    const tones = read("src/components/owner-dashboard/owner-form-tones.ts");
    expect(tones).toContain('import { fieldControlClassName } from "@/components/ui/input"');
    expect(tones).toMatch(
      /ownerNoticeAviso =\s*"[^"]*border-ochre-line[^"]*bg-ochre-wash[^"]*text-ochre-ink[^"]*"/
    );
    expect(tones).not.toMatch(/signal|z-chalk/);
  });

  it("los botones principales de cobros y alta usan ownerUi en tapiz", () => {
    expect(read("src/components/owner-dashboard/ManualPaymentForm.tsx")).toContain(
      "className={ownerUi.primaryButton}"
    );
    expect(read("src/components/owner-dashboard/OwnerSetupForm.tsx")).toContain(
      "className={ownerUi.primaryButton}"
    );
    const resolutionModel = read("src/components/owner-dashboard/owner-monthly-resolution-model.ts");
    expect(resolutionModel).toContain("export const primaryButtonClassName = ownerUi.primaryButton;");
    expect(resolutionModel).toContain("export const secondaryButtonClassName = ownerUi.secondaryButton;");
    const workspace = read("src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx");
    expect(workspace).toContain("const buttonClassName = ownerUi.primaryButton;");
  });

  it("los errores de cobros y alta van en señal y los pendientes en ocre", () => {
    const notices = read("src/components/owner-dashboard/ManualPaymentNotices.tsx");
    expect(notices).toContain("className={ownerNoticeAviso}");
    expect(notices).toContain("ownerUi.noticeError");
    const setupForm = read("src/components/owner-dashboard/OwnerSetupForm.tsx");
    expect(setupForm).toContain("className={ownerUi.noticeError}");
    expect(setupForm).toContain("text-ochre-ink");
  });

  it("el alta continúa el registro: titular display en mayúsculas y regla de 3 px", () => {
    for (const path of ["src/app/owner/setup/page.tsx", "src/app/owner/setup/preview/page.tsx"]) {
      const source = read(path);
      expect(source).toMatch(/font-display[^"]*font-black uppercase/);
      expect(source).not.toContain("tracking-[-0.04em]");
    }
    expect(read("src/components/owner-dashboard/OwnerSetupForm.tsx")).toContain(
      "border-t-[3px] border-z-ink pt-8"
    );
  });
});
