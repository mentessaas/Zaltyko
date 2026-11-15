"use client";

import Link from "next/link";
import { primaryButtonClassName } from "./owner-monthly-resolution-model";
import { ownerUi } from "./owner-ui";
import { cn } from "@/lib/utils";
import type { PendingResolutionCommand } from "./owner-monthly-resolution-pending-storage";

/**
 * A billing command whose result is still unconfirmed. It can only be retried
 * with the same key from its own academy, site and period.
 */
export function MonthlyResolutionPendingNotice({
  pendingCommand,
  matchesCurrentScope,
  replayDisabled,
  onReplay,
}: {
  pendingCommand: PendingResolutionCommand;
  matchesCurrentScope: boolean;
  replayDisabled: boolean;
  onReplay: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(ownerUi.noticeWarning, "grid gap-3")}
    >
      <p>
        Hay un cambio de cuotas sin confirmar. Conservamos su academia, sede y periodo. No se hará otro desde este panel hasta resolverlo.
      </p>
      {matchesCurrentScope ? (
        <button
          type="button"
          disabled={replayDisabled}
          onClick={onReplay}
          className={`${primaryButtonClassName} w-fit`}
        >
          Reintentar la misma operación
        </button>
      ) : (
        <Link
          className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
          href={`/owner/monthly-invoices?${new URLSearchParams({
            organizationId: pendingCommand.organizationId,
            locationId: pendingCommand.locationId,
            servicePeriod: pendingCommand.servicePeriod,
          }).toString()}`}
        >
          Volver a su academia, sede y periodo
        </Link>
      )}
    </div>
  );
}

/** A command confirmed after the panel moved to another scope. */
export function MonthlyResolutionReceiptNotice({
  commandReceipt,
}: {
  commandReceipt: {
    organizationId: string;
    locationId: string;
    servicePeriod: string;
    message: string;
  };
}) {
  return (
    <div role="status" className={cn(ownerUi.noticeInfo, "grid gap-2")}>
      <p>{commandReceipt.message} No hemos cambiado el catálogo de la vista actual.</p>
      <Link
        className="min-h-11 w-fit content-center font-bold underline underline-offset-2"
        href={`/owner/monthly-invoices?${new URLSearchParams({
          organizationId: commandReceipt.organizationId,
          locationId: commandReceipt.locationId,
          servicePeriod: commandReceipt.servicePeriod,
        }).toString()}`}
      >
        Volver al ámbito de la operación
      </Link>
    </div>
  );
}
