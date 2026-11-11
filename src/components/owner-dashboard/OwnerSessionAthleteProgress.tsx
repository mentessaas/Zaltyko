"use client";

import { useId, useState } from "react";
import { Flag } from "lucide-react";

import { OwnerAthleteProgressPanel } from "./OwnerAthleteProgressPanel";
import { ownerUi } from "./owner-ui";

/**
 * Lectura desde Pasar lista (P2 #17): «Ver objetivos» despliega los objetivos
 * y las últimas observaciones de una gimnasta de la sesión. El entrenador puede
 * cambiar el estado de los objetivos que creó; no hay formularios de alta aquí
 * (para eso está «Observación»). Se monta solo al abrirse: no hay una petición
 * por gimnasta al cargar la lista.
 */
export function OwnerSessionAthleteProgress({
  organizationId,
  locationId,
  sessionId,
  enrollmentId,
  athleteName,
  readOnly,
}: {
  organizationId: string;
  locationId: string;
  sessionId: string;
  enrollmentId: string;
  athleteName: string;
  readOnly: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className={`${ownerUi.secondaryButton} min-h-11`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Ver objetivos de ${athleteName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        {open ? "Ocultar objetivos" : "Ver objetivos"}
      </button>
      {open ? (
        <div id={panelId}>
          <OwnerAthleteProgressPanel
            organizationId={organizationId}
            locationId={locationId}
            sessionRef={{ sessionId, enrollmentId }}
            athleteName={athleteName}
            readOnly={readOnly}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
