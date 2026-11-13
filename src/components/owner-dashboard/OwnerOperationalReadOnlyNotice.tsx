"use client";

import Link from "next/link";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { ownerTone } from "./owner-tone-ui";

// Comprobando: polvo (información). Comprobación fallida: error recuperable en
// señal. Solo lectura confirmada por el plan: aviso en ocre (no es un fallo).
const CHECKING_CLASS = `mt-5 ${ownerTone.noticeNeutral}`;
const ERROR_CLASS = `mt-5 ${ownerTone.noticeError}`;
const WARNING_CLASS = `mt-5 ${ownerTone.noticeWarning}`;

export function OwnerOperationalReadOnlyNotice({
  organizationId,
  enabled = true,
  subscriptionLinks = true,
}: {
  organizationId: string;
  enabled?: boolean;
  /** False for coaches (P1 #8): they cannot open Plan, so no link to it. */
  subscriptionLinks?: boolean;
}) {
  const policy = useOwnerPlanPolicy(organizationId, enabled);
  if (!subscriptionLinks) return <StaffReadOnlyNotice policy={policy} />;
  if (policy.status === "loading") {
    return (
      <p
        role="status"
        className={CHECKING_CLASS}
      >
        Comprobando los límites del plan. Las escrituras nuevas están pausadas
        hasta confirmar que la academia puede operar. {" "}
        <Link
          className="font-bold underline underline-offset-2"
          href={`/owner/subscription?organizationId=${encodeURIComponent(organizationId)}#regularizar`}
        >
          Consultar uso y plan
        </Link>
        .
      </p>
    );
  }

  if (policy.status === "error") {
    return (
      <div
        role="status"
        className={ERROR_CLASS}
      >
        <p>
          No se pudieron comprobar los límites del plan. Vuelve a consultar el
          uso antes de realizar cambios. {" "}
          <Link
            className="font-bold underline underline-offset-2"
            href={`/owner/subscription?organizationId=${encodeURIComponent(organizationId)}#regularizar`}
          >
            Consultar uso y regularizar
          </Link>
          .
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 font-bold underline underline-offset-2"
          onClick={() =>
            window.dispatchEvent(new Event("zaltyko:plan-usage-changed"))
          }
        >
          Volver a comprobar límites
        </button>
      </div>
    );
  }

  if (policy.status !== "ready" || !policy.readOnly) return null;

  return (
    <p
      role="status"
      className={WARNING_CLASS}
    >
      La academia está en solo lectura porque supera los límites del plan. Los
      datos y el historial se conservan. Para volver a operar, archiva el
      excedente o contrata un plan suficiente en{" "}
      <Link
        className="font-bold underline underline-offset-2"
        href={`/owner/subscription?organizationId=${encodeURIComponent(organizationId)}#regularizar`}
      >
        Uso y regularización
      </Link>
      .
    </p>
  );
}

/** Coach wording: same states, no commercial links, points to the club lead. */
function StaffReadOnlyNotice({
  policy,
}: {
  policy: ReturnType<typeof useOwnerPlanPolicy>;
}) {
  if (policy.status === "loading") {
    return (
      <p
        role="status"
        className={CHECKING_CLASS}
      >
        Comprobando si la academia puede registrar cambios. Podrás pasar lista
        en cuanto termine la comprobación.
      </p>
    );
  }

  if (policy.status === "error") {
    return (
      <div
        role="status"
        className={ERROR_CLASS}
      >
        <p>
          No se pudo comprobar si la academia puede registrar cambios. Vuelve a
          intentarlo; si sigue fallando, avisa a la persona responsable del
          club.
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 font-bold underline underline-offset-2"
          onClick={() =>
            window.dispatchEvent(new Event("zaltyko:plan-usage-changed"))
          }
        >
          Volver a comprobar
        </button>
      </div>
    );
  }

  if (policy.status !== "ready" || !policy.readOnly) return null;

  return (
    <p
      role="status"
      className={WARNING_CLASS}
    >
      La academia está en solo lectura: puedes consultar las listas, pero no
      pasar lista. Los datos se conservan. Avisa a la persona
      responsable del club para que lo regularice.
    </p>
  );
}
