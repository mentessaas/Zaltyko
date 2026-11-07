"use client";

import Link from "next/link";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";

export function OwnerOperationalReadOnlyNotice({
  organizationId,
  enabled = true,
}: {
  organizationId: string;
  enabled?: boolean;
}) {
  const policy = useOwnerPlanPolicy(organizationId, enabled);
  if (policy.status === "loading") {
    return (
      <p
        role="status"
        className="rounded-[12px] mt-5 border border-z-line bg-z-canvas p-4 text-sm leading-6 text-z-ink"
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
        className="rounded-[12px] mt-5 border border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-z-ink"
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
      className="rounded-[12px] mt-5 border border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-z-ink"
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
