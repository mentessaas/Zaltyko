import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { getFamilyFees } from "@/modules/family-portal/application/family-portal-reads";
import {
  FAMILY_PAYMENT_NOTICE,
  feeStatusLabel,
  formatDueDate,
  formatMoney,
  formatPeriod,
} from "@/modules/family-portal/domain/family-portal-presentation";

import { requireFamilyUser } from "../_lib/family-user";

export const dynamic = "force-dynamic";

export default async function FamilyFeesPage() {
  const user = await requireFamilyUser("/familia/cuotas");
  const academies = await getFamilyFees({ userId: user.id });

  return (
    <FamilyPortalShell active="fees">
      <PageHeader
        title="Cuotas"
        description="Estado de las cuotas emitidas por tu academia."
        className={ownerUi.pageHeader}
      />

      <p className={`${ownerUi.noticeInfo} mb-6`} role="note">
        {FAMILY_PAYMENT_NOTICE}
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </FamilyPortalShell>
  );
}
