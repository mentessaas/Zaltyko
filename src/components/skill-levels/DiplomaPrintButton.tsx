"use client";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";

/** Abre el diálogo de impresión del navegador, desde donde se guarda también como PDF. */
export function DiplomaPrintButton() {
  return (
    <button type="button" className={ownerUi.primaryButton} onClick={() => window.print()}>
      Imprimir o guardar como PDF
    </button>
  );
}
