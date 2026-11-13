"use client";

import type { OwnerPlanPolicy } from "./owner-plan-usage-store";
import { ownerTone } from "./owner-tone-ui";
import { ownerUi } from "./owner-ui";

/**
 * Estado de la comprobación del plan visto desde un panel que escribe:
 * - `checking`: todavía no sabemos si la academia puede operar. Las
 *   escrituras esperan, pero no se dice «solo lectura».
 * - `unverified`: la comprobación falló. Error recuperable con reintento.
 * - `read_only`: el plan confirma que la academia está en solo lectura.
 * - `ok`: se puede operar.
 */
export type OwnerPlanCheck = "checking" | "unverified" | "read_only" | "ok";

export function ownerPlanCheckOf(policy: OwnerPlanPolicy): OwnerPlanCheck {
  if (policy.status !== "ready") return policy.status === "loading" ? "checking" : "unverified";
  return policy.readOnly ? "read_only" : "ok";
}

/** Pide otra lectura del uso del plan (la escucha `owner-plan-usage-store`). */
export function retryOwnerPlanCheck() {
  window.dispatchEvent(new Event("zaltyko:plan-usage-changed"));
}

/**
 * Nota bajo un panel que no puede escribir todavía. Solo dice «solo lectura»
 * cuando el plan lo confirma; mientras se comprueba muestra un estado neutro
 * y, si la comprobación falla, un error con reintento.
 */
export function OwnerPlanCheckNote({
  check,
  readOnlyText,
}: {
  check: OwnerPlanCheck;
  /** Texto de solo lectura propio del panel. */
  readOnlyText: string;
}) {
  if (check === "ok") return null;
  if (check === "checking") {
    return (
      <p role="status" aria-live="polite" className={ownerUi.help}>
        Comprobando el plan…
      </p>
    );
  }
  if (check === "unverified") {
    return (
      <div role="alert" className={`${ownerTone.noticeError} flex flex-wrap items-center justify-between gap-2`}>
        <p>No pudimos comprobar el plan.</p>
        <button
          type="button"
          className={ownerTone.quietButton}
          aria-label="Reintentar la comprobación del plan"
          onClick={retryOwnerPlanCheck}
        >
          Reintentar
        </button>
      </div>
    );
  }
  return <p className={ownerUi.help}>{readOnlyText}</p>;
}
