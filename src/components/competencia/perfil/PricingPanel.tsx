"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import type {
  CiPricingPlanRow,
  CiSourceRow,
} from "@/db/schema/competitive-intelligence";
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
  DATA_STATUSES,
  DATA_STATUS_LABELS,
  VAT_MODES,
  VAT_MODE_LABELS,
} from "@/lib/competencia/domain";
import { reviewState, todayIso } from "@/lib/competencia/review";

import { emptyToNull, numberOrNull, sendCompetencia } from "../client-api";
import {
  EmptyNote,
  ReviewPill,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "../ui";
import { useSaver, ErrorLine } from "./shared";

/* ---------- Precios ---------- */

export function PricingForm({
  competitorId,
  plan,
  sources,
  onDone,
}: {
  competitorId: string;
  plan?: CiPricingPlanRow;
  sources: CiSourceRow[];
  onDone?: () => void;
}) {
  const { saving, error, run } = useSaver();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      planName: String(form.get("planName") ?? ""),
      priceAmount: numberOrNull(form.get("priceAmount")),
      currency: String(form.get("currency") ?? "EUR"),
      billingPeriod: String(form.get("billingPeriod")),
      vatMode: String(form.get("vatMode")),
      limitsText: emptyToNull(form.get("limitsText")),
      feesText: emptyToNull(form.get("feesText")),
      extrasText: emptyToNull(form.get("extrasText")),
      trialText: emptyToNull(form.get("trialText")),
      commitmentText: emptyToNull(form.get("commitmentText")),
      estimateSmall: emptyToNull(form.get("estimateSmall")),
      estimateMedium: emptyToNull(form.get("estimateMedium")),
      estimateLarge: emptyToNull(form.get("estimateLarge")),
      sourceId: emptyToNull(form.get("sourceId")),
      dataStatus: String(form.get("dataStatus")),
      lastVerifiedOn: emptyToNull(form.get("lastVerifiedOn")),
      reviewAfterDays: Number(form.get("reviewAfterDays") ?? 60),
    };
    run(
      () =>
        plan
          ? sendCompetencia(
              `/api/super-admin/competencia/pricing/${plan.id}`,
              "PATCH",
              body
            )
          : sendCompetencia(
              `/api/super-admin/competencia/competitors/${competitorId}/pricing`,
              "POST",
              body
            ),
      () => {
        if (!plan) formElement.reset();
        onDone?.();
      }
    );
  }
  const text = (name: keyof CiPricingPlanRow, label: string, wide = false) => (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={ciLabel}>{label}</span>
      <input
        name={name}
        defaultValue={(plan?.[name] as string | null) ?? ""}
        className={`${ciInput} mt-2`}
      />
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Plan *</span>
          <input
            name="planName"
            required
            defaultValue={plan?.planName}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Importe</span>
          <input
            name="priceAmount"
            inputMode="decimal"
            defaultValue={plan?.priceAmount ?? ""}
            placeholder="vacío = no publicado"
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Moneda</span>
          <input
            name="currency"
            defaultValue={plan?.currency ?? "EUR"}
            maxLength={3}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Periodo</span>
          <select
            name="billingPeriod"
            defaultValue={plan?.billingPeriod ?? "mes"}
            className={`${ciInput} mt-2`}
          >
            {BILLING_PERIODS.map((period) => (
              <option key={period} value={period}>
                {BILLING_PERIOD_LABELS[period]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>IVA</span>
          <select
            name="vatMode"
            defaultValue={plan?.vatMode ?? "desconocido"}
            className={`${ciInput} mt-2`}
          >
            {VAT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {VAT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Estado del dato</span>
          <select
            name="dataStatus"
            defaultValue={plan?.dataStatus ?? "verificado"}
            className={`${ciInput} mt-2`}
          >
            {DATA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {DATA_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Comprobado el</span>
          <input
            name="lastVerifiedOn"
            type="date"
            defaultValue={plan?.lastVerifiedOn ?? todayIso()}
            className={`${ciInput} mt-2`}
          />
        </label>
        {text("limitsText", "Límites", true)}
        {text("feesText", "Comisiones", true)}
        {text("extrasText", "Extras", true)}
        {text("trialText", "Prueba / demo")}
        {text("commitmentText", "Permanencia")}
        {text("estimateSmall", "Coste club S (30 / 3)")}
        {text("estimateMedium", "Coste club M (75 / 5)")}
        {text("estimateLarge", "Coste club L (150 / 10)")}
        <label className="block">
          <span className={ciLabel}>Revisar cada (días)</span>
          <input
            name="reviewAfterDays"
            type="number"
            min={1}
            max={730}
            defaultValue={plan?.reviewAfterDays ?? 60}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Fuente</span>
          <select
            name="sourceId"
            defaultValue={plan?.sourceId ?? ""}
            className={`${ciInput} mt-2`}
          >
            <option value="">Sin fuente</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title ?? source.url}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}{" "}
          {plan ? "Guardar plan" : "Añadir plan"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className={ciButtonGhost}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function PricingPanel({
  competitorId,
  pricing,
  sources,
}: {
  competitorId: string;
  pricing: CiPricingPlanRow[];
  sources: CiSourceRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {pricing.length === 0 ? (
        <EmptyNote title="Sin planes registrados">
          Si no publican precios, añade un plan «a consultar» sin importe; no
          inventes valores.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {pricing.map((plan) => (
            <li key={plan.id} className={ciCard}>
              {editingId === plan.id ? (
                <PricingForm
                  competitorId={competitorId}
                  plan={plan}
                  sources={sources}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">
                        {plan.planName}
                      </p>
                      <p className="text-sm text-white/80">
                        {plan.priceAmount === null
                          ? "No publicado"
                          : `${Number(plan.priceAmount).toLocaleString("es-ES")} ${plan.currency}`}{" "}
                        {
                          BILLING_PERIOD_LABELS[
                            plan.billingPeriod as keyof typeof BILLING_PERIOD_LABELS
                          ]
                        }{" "}
                        ·{" "}
                        {
                          VAT_MODE_LABELS[
                            plan.vatMode as keyof typeof VAT_MODE_LABELS
                          ]
                        }
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReviewPill state={reviewState(plan)} />
                      <button
                        type="button"
                        onClick={() => setEditingId(plan.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-x-4 gap-y-1 text-xs text-white/65 sm:grid-cols-2">
                    {[
                      ["Límites", plan.limitsText],
                      ["Comisiones", plan.feesText],
                      ["Extras", plan.extrasText],
                      ["Prueba", plan.trialText],
                      ["Permanencia", plan.commitmentText],
                      ["Club S (30/3)", plan.estimateSmall],
                      ["Club M (75/5)", plan.estimateMedium],
                      ["Club L (150/10)", plan.estimateLarge],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="flex gap-1">
                          <dt className="text-white/45">{label}:</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={ciCard}>
        <h3 className="font-semibold text-white">Añadir plan de precios</h3>
        <div className="mt-3">
          <PricingForm competitorId={competitorId} sources={sources} />
        </div>
      </div>
    </div>
  );
}
