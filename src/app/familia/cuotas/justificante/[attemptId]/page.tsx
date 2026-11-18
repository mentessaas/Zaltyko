import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { DiplomaPrintButton } from "@/components/skill-levels/DiplomaPrintButton";
import { isFamilyCollectionReceiptsFlagEnabled } from "@/modules/family-collection/application/config";
import {
  familyReceiptFeeLine,
  familyReceiptNotInvoiceText,
  familyReceiptRows,
  familyReceiptStatusLines,
} from "@/modules/family-collection/domain/family-receipt";
import { formatMoney } from "@/modules/family-portal/domain/family-portal-presentation";

import { requireFamilyUser } from "../../../_lib/family-user";

// Datos de una familia: nunca en caché (Next responde `private, no-store`).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const paramsSchema = z.object({ attemptId: z.guid() });

/**
 * Justificante de pago de una cuota cobrada automáticamente (Fase 4, Tarea 9,
 * D6), imprimible. Solo lo ve la persona que paga esa cuota. Sin la bandera
 * ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED, con un id que no es suyo o
 * desconocido: el mismo 404. No es una factura y no lleva numeración.
 */
export default async function FamilyReceiptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  // Apagada: 404 sin pedir sesión ni leer la base.
  if (!isFamilyCollectionReceiptsFlagEnabled()) notFound();
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { attemptId } = parsed.data;
  const user = await requireFamilyUser(`/familia/cuotas/justificante/${attemptId}`);

  // Import diferido: el módulo del cobro solo se carga con la bandera encendida.
  const { findFamilyReceipt } = await import("@/modules/family-collection/application/family-receipt-reads");
  const receipt = await findFamilyReceipt({ userId: user.id, attemptId });
  if (!receipt) notFound();

  return (
    <FamilyPortalShell active="fees">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/familia/cuotas" className={ownerUi.backLink}>
          ← Volver a cuotas
        </Link>
        <DiplomaPrintButton />
      </div>
      <article className={ownerUi.card} aria-labelledby="receipt-title">
        <h1 id="receipt-title" className={ownerUi.sectionTitle}>
          Justificante de pago
        </h1>
        {/* Tarea M (punto 13): devuelto o en revisión con el banco, sin ocultar el justificante. */}
        {familyReceiptStatusLines(receipt).map((line) => (
          <p key={line} className="mt-3 text-sm font-semibold text-z-ink">
            {line}
          </p>
        ))}
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {familyReceiptRows(receipt).map((row) => (
            <div key={row.label}>
              <dt className={ownerUi.smallLabel}>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-6 space-y-2 text-sm">
          {receipt.fees.map((fee, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-2">
              <span>{familyReceiptFeeLine(fee)}</span>
              <span className="tabular-nums">{formatMoney(fee.amountCents, receipt.currency)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap justify-between gap-2 border-t border-z-line pt-4 font-semibold text-z-ink">
          <span>Total pagado</span>
          <span className="tabular-nums">{formatMoney(receipt.totalCents, receipt.currency)}</span>
        </p>
        <p className={`${ownerUi.muted} mt-6`}>{familyReceiptNotInvoiceText(receipt.academyName)}</p>
      </article>
    </FamilyPortalShell>
  );
}
