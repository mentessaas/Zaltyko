/**
 * Resolucion de `next_step_label` para la secuencia de onboarding d0/d2/d7.
 *
 * Gap 1 (ZAL-324, veredicto ZAL-311 Opcion A): el copy NO debe hardcodear
 * etiquetas en §3 del attachment ZAL-139. La etiqueta se resuelve en tiempo
 * de render a partir de la fila de `onboarding_checklist_items` del proximo
 * paso pendiente.
 *
 * Precedencia de la etiqueta (documentada porque afecta al copy de Content,
 * ver ZAL-507):
 *   1. `CHECKLIST_DEFINITIONS[key].label` — fuente canonica. Se prefiere sobre
 *      la fila porque el seed (`seedOnboardingForAcademy`) usa
 *      `onConflictDoNothing`: las academias ya sembradas conservan la etiqueta
 *      vieja en DB, asi que leer solo la fila congelaria cualquier retoque
 *      editorial para el parque instalado.
 *   2. `row.label` — fallback para claves que no esten en CHECKLIST_DEFINITIONS
 *      (filas legacy o claves introducidas fuera del catalogo).
 *
 * Owner: Web Developer (ZAL-324 Gap 1, lado tecnico).
 * Copy: Content (ZAL-507, §3/§3.1 del v0.3).
 */

import { CHECKLIST_DEFINITIONS, type ChecklistKey } from "../onboarding-utils";
import { isNextStepKey, resolveNextStepUrl } from "./next-step-urls";

/** Fila minima de `onboarding_checklist_items` que necesita el resolver. */
export interface ChecklistRowLike {
  key: string;
  label: string | null;
  status: string;
}

export interface ResolvedNextStep {
  key: string;
  label: string;
  url: string;
  /** De donde salio la etiqueta; util para depurar drift en QA. */
  labelSource: "definition" | "row";
}

const CANONICAL_LABELS: ReadonlyMap<string, string> = new Map(
  CHECKLIST_DEFINITIONS.map((definition) => [definition.key, definition.label])
);

/**
 * Etiqueta canonica de una clave de checklist. Devuelve `null` si la clave no
 * pertenece al catalogo — el caller decide si cae a la fila o lanza.
 */
export function canonicalChecklistLabel(key: string): string | null {
  return CANONICAL_LABELS.get(key) ?? null;
}

/**
 * Resuelve la etiqueta de un paso a partir de su clave y (opcionalmente) la
 * fila persistida. Lanza si no hay ninguna de las dos fuentes: un email sin
 * etiqueta es peor que un envio fallido y detectable.
 */
export function resolveNextStepLabel(
  key: string,
  rowLabel?: string | null
): { label: string; labelSource: "definition" | "row" } {
  const canonical = canonicalChecklistLabel(key);
  if (canonical) {
    return { label: canonical, labelSource: "definition" };
  }
  const trimmed = rowLabel?.trim();
  if (trimmed) {
    return { label: trimmed, labelSource: "row" };
  }
  throw new Error(
    `next_step_label no resoluble para la clave ${JSON.stringify(key)}: ` +
      `no esta en CHECKLIST_DEFINITIONS y la fila no trae label.`
  );
}

/**
 * Selecciona el proximo paso pendiente y devuelve la tripleta que consume la
 * plantilla: `next_step_key`, `next_step_label` y `next_step_url`.
 *
 * El orden de las filas es responsabilidad del caller (`getChecklist` ya
 * ordena por `createdAt`, que replica el orden de CHECKLIST_DEFINITIONS).
 * Los items `completed` y `skipped` se saltan.
 *
 * @returns el paso resuelto, o `null` si el checklist esta completo.
 */
export function resolveNextStep(
  rows: ReadonlyArray<ChecklistRowLike>,
  appUrl: string
): ResolvedNextStep | null {
  const pending = rows.find((row) => row.status === "pending");
  if (!pending) {
    return null;
  }
  if (!isNextStepKey(pending.key)) {
    throw new Error(
      `next_step_key fuera del allowlist de URLs: ${JSON.stringify(pending.key)}. ` +
        `Agregalo a NEXT_STEP_URLS antes de activar la secuencia.`
    );
  }
  const { label, labelSource } = resolveNextStepLabel(pending.key, pending.label);
  return {
    key: pending.key,
    label,
    url: resolveNextStepUrl(pending.key, appUrl),
    labelSource,
  };
}

/**
 * Cobertura de etiquetas: toda clave de CHECKLIST_DEFINITIONS debe tener
 * tambien URL en el allowlist. Sirve como assert de integracion en tests y
 * como cross-check para el copy de §3.
 */
export function listCanonicalLabels(): Array<{ key: ChecklistKey; label: string }> {
  return CHECKLIST_DEFINITIONS.map(({ key, label }) => ({ key, label }));
}
