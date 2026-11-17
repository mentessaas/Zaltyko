import {
  FamilyAutomaticPaymentCard,
  type FamilyAutomaticPaymentCards,
} from "@/components/family-portal/FamilyAutomaticPaymentCard";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import type { FamilyAcademyFees } from "@/modules/family-portal/application/family-portal-reads";
import {
  FAMILY_AUTOMATIC_PAYMENT_NOTICE,
  FAMILY_PAYMENT_NOTICE,
  familyAutomaticFeeText,
  familyCardCollectionMode,
  feeStatusLabel,
  type FamilyAutomaticCollectionModes,
  type FamilyAutomaticFeeStatuses,
  formatDueDate,
  formatMoney,
  formatPeriod,
} from "@/modules/family-portal/domain/family-portal-presentation";

/**
 * Cuerpo de «Cuotas»: el aviso de pago y las cuotas emitidas por la academia.
 * Lo comparten /familia/cuotas (datos reales) y la demo pública. Solo
 * /familia/cuotas pasa `automaticPayments` y `automaticCollection`: la demo
 * nunca enseña el pago automático ni el estado de un cobro automático.
 */
export function FamilyFeesView({
  academies,
  automaticPayments,
  automaticCollection,
  automaticCollectionModes,
  sepaCollectsAutomatically = false,
}: {
  academies: FamilyAcademyFees[];
  /** Por academia, una tarjeta de pago automático por familia que paga. */
  automaticPayments?: FamilyAutomaticPaymentCards;
  /** Por factura, el estado de su cobro automático (Fase 3). */
  automaticCollection?: FamilyAutomaticFeeStatuses;
  /**
   * Si el cobro automático está abierto y qué familias se cobran solas. Sin
   * indicar, cerrado: ninguna tarjeta promete un cobro.
   */
  automaticCollectionModes?: FamilyAutomaticCollectionModes;
  /** La domiciliación se cobra sola; sin indicar, no (ninguna promesa de cobro por domiciliación). */
  sepaCollectsAutomatically?: boolean;
}) {
  const offersAutomaticPayment = academies.some(
    (academy) => (automaticPayments?.[academy.organizationId]?.length ?? 0) > 0
  );
  return (
    <>
      <p className={`${ownerUi.noticeInfo} mb-6`} role="note">
        {offersAutomaticPayment ? FAMILY_AUTOMATIC_PAYMENT_NOTICE : FAMILY_PAYMENT_NOTICE}
      </p>

      {academies.length === 0 ? (
        <section className={ownerUi.emptyState} aria-labelledby="family-no-fees-title">
          <h2 id="family-no-fees-title" className={ownerUi.cardTitle}>
            No hay cuotas que consultar
          </h2>
          <p className={`${ownerUi.muted} mt-3 max-w-md`}>
            Las cuotas solo las ve la persona pagadora de la familia. Si crees que es un
            error, habla con tu academia.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {academies.map((academy) => (
            <section
              key={academy.organizationId}
              className={ownerUi.card}
              aria-labelledby={`fees-${academy.organizationId}`}
            >
              <h2 id={`fees-${academy.organizationId}`} className={ownerUi.sectionTitle}>
                {academy.organizationName}
              </h2>
              {academy.fees.length === 0 ? (
                <p className={`${ownerUi.muted} mt-3`}>No hay cuotas emitidas.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {academy.fees.map((fee) => {
                    const period = formatPeriod(fee.periodStart, fee.periodEnd);
                    const automatic = automaticCollection?.[fee.invoiceId];
                    return (
                      <li key={fee.invoiceId} className={ownerUi.listItem}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-z-ink">
                            Cuota {fee.reference}
                          </p>
                          <span
                            className={
                              fee.status === "paid"
                                ? ownerUi.chipSuccess
                                : ownerTone.chipWarning
                            }
                          >
                            {feeStatusLabel(fee.status)}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
                          {period ? (
                            <div>
                              <dt className={ownerUi.smallLabel}>Periodo</dt>
                              <dd>{period}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className={ownerUi.smallLabel}>Vence</dt>
                            <dd>{formatDueDate(fee.dueAt, academy.timezone)}</dd>
                          </div>
                          <div>
                            <dt className={ownerUi.smallLabel}>Importe</dt>
                            <dd className="tabular-nums">
                              {formatMoney(fee.totalCents, fee.currency)}
                            </dd>
                          </div>
                          <div>
                            <dt className={ownerUi.smallLabel}>Pagado</dt>
                            <dd className="tabular-nums">
                              {formatMoney(fee.paidCents, fee.currency)}
                            </dd>
                          </div>
                          {fee.refundedCents > 0 ? (
                            <div>
                              <dt className={ownerUi.smallLabel}>Devuelto</dt>
                              <dd className="tabular-nums">
                                {formatMoney(fee.refundedCents, fee.currency)}
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className={ownerUi.smallLabel}>Pendiente</dt>
                            <dd className="tabular-nums font-semibold">
                              {formatMoney(fee.pendingCents, fee.currency)}
                            </dd>
                          </div>
                        </dl>
                        {automatic ? (
                          <p
                            className={`mt-3 ${
                              automatic.kind === "not_collected"
                                ? ownerTone.inlineWarning
                                : ownerUi.muted
                            }`}
                          >
                            {familyAutomaticFeeText(automatic)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {(automaticPayments?.[academy.organizationId] ?? []).map((card) => (
                <div key={card.familyId} className="mt-6">
                  <FamilyAutomaticPaymentCard
                    organizationId={academy.organizationId}
                    familyId={card.familyId}
                    timezone={academy.timezone}
                    state={card.state}
                    automaticCollection={familyCardCollectionMode(
                      automaticCollectionModes,
                      academy.organizationId,
                      card.familyId
                    )}
                    sepaCollectsAutomatically={sepaCollectsAutomatically}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
