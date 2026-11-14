"use client";

import { useState } from "react";
import Link from "next/link";

import { PricingPageTracker } from "@/components/growth/PricingPageTracker";
import { TrackedPlanLink } from "@/components/growth/TrackedPlanLink";
import type { CommercialPlanSlug } from "@/lib/growth/contracts";
import { PUBLIC_PRODUCT_PLANS, formatPlanAmount } from "@/lib/plans/catalog";
import {
  formatEuroCentsExact,
  quoteSpanishVat,
  SPANISH_VAT_GENERAL_RATE_PERCENT,
} from "@/modules/saas-billing/domain/spanish-vat";
import { cn } from "@/lib/utils";

/**
 * Precios «Magnesio sobre tapiz»: cabecera en tapiz, y debajo una tabla
 * reglada de tres columnas sobre magnesio, como una hoja de inscripción.
 * El plan destacado lleva el campo azul; el resto, solo línea. Todas las
 * cifras salen del catálogo; nada se escribe a mano.
 */

const plans = PUBLIC_PRODUCT_PLANS.map((plan) => ({
  ...plan,
  planCode: (plan.code === "pro" ? "starter" : plan.code === "premium" ? "growth" : plan.code) as CommercialPlanSlug,
}));

const euroExact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const LIMIT_ROWS: { label: string; get: (p: (typeof plans)[number]) => string }[] = [
  { label: "Gimnastas", get: (p) => (p.athleteLimit === null ? "Ilimitadas" : `Hasta ${p.athleteLimit}`) },
  { label: "Grupos", get: (p) => (p.groupLimit === null ? "Ilimitados" : String(p.groupLimit)) },
  { label: "Clases activas", get: (p) => (p.classLimit === null ? "Ilimitadas" : String(p.classLimit)) },
  { label: "Academias", get: (p) => (p.academyLimit === null ? "Sin límite" : String(p.academyLimit)) },
];

const PROMISES = [
  { title: "Aislamiento por academia", text: "Controles de acceso por rol y separación de datos entre academias." },
  { title: "Puesta en marcha guiada", text: "Un recorrido paso a paso para configurar la operación principal." },
  { title: "Solo gimnasia", text: "Terminología y flujos de gimnasia artística y rítmica." },
];

export default function PricingSection({ paidCheckoutOpen = false }: { paidCheckoutOpen?: boolean } = {}) {
  const [interval, setBilling] = useState<"month" | "year">("month");

  return (
    <div id="planes">
      <PricingPageTracker />

      <section aria-labelledby="pricing-title" className="mat-field relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0 top-3 border-x-[3px] border-t-[3px] border-white/80 sm:inset-x-6 sm:top-6" />
        <div className="relative mx-auto max-w-7xl px-8 pb-14 pt-16 sm:px-14 lg:pb-16 lg:pt-20">
          <h1
            id="pricing-title"
            className="font-display max-w-4xl text-[clamp(2.75rem,7vw,5.5rem)] font-black uppercase leading-[0.9] text-white"
          >
            Un plan por etapa de academia
          </h1>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <p className="max-w-2xl text-lg leading-relaxed text-white/85">
              Organiza gimnastas, grupos, asistencia y cuotas con registro manual de pagos para gimnasia
              artística y rítmica. Empieza gratis y configura tu academia. Desde Facturación puedes activar
              7 días de Starter sin tarjeta (una activación por academia cada 12 meses).{" "}
              {paidCheckoutOpen
                ? "Después puedes elegir Starter o Growth con pago mensual o anual."
                : "Durante la apertura, las academias fundadoras usan Starter o Growth sin coste; la contratación con pago llegará después."}{" "}
              La prueba no genera cargos automáticos. Precios finales con IVA ({SPANISH_VAT_GENERAL_RATE_PERCENT} %) para
              Península y Baleares, con la base sin IVA debajo; en Canarias, Ceuta y Melilla todavía no hay contratación de pago.
            </p>

            <fieldset aria-label="Periodicidad de precios">
              <legend className="sr-only">Periodicidad de precios</legend>
              <div className="relative inline-grid grid-cols-2 rounded-md bg-mat-night/40 p-1">
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute bottom-1 top-1 rounded-sm bg-white transition-transform duration-200 ease-out motion-reduce:transition-none",
                    interval === "year" && "translate-x-full"
                  )}
                  style={{ left: "4px", width: "calc(50% - 4px)" }}
                />
                {(
                  [
                    ["month", "Mensual"],
                    ["year", "Anual · ahorra 2 meses"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="relative z-10 flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-3 py-2 text-center leading-tight sm:whitespace-nowrap sm:px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white"
                  >
                    <input
                      type="radio"
                      name="billing-interval"
                      value={value}
                      checked={interval === value}
                      onChange={() => setBilling(value)}
                      className="sr-only"
                    />
                    <span className={cn("text-sm font-bold transition-colors", interval === value ? "text-mat-deep" : "text-white")}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </section>

      <section aria-label="Planes" className="chalk-field">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10 lg:px-14 lg:py-20">
          <ul className="grid overflow-hidden rounded-lg border border-chalk-line bg-white md:grid-cols-3">
            {plans.map((plan, i) => {
              const yearly = interval === "year" && plan.annualPriceEurCents;
              return (
                <li
                  key={plan.code}
                  className={cn(
                    "flex flex-col border-chalk-line",
                    i > 0 && "border-t md:border-l md:border-t-0",
                    plan.highlight && "mat-field text-white"
                  )}
                >
                  <div className="flex flex-1 flex-col p-6 lg:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className={cn("font-display text-3xl font-black uppercase", plan.highlight ? "text-white" : "text-mat-night")}>
                        {plan.publicName}
                      </h2>
                      {plan.highlight && (
                        <span className="floor-label rounded-sm bg-white px-2 py-1 text-mat-deep">Más capacidad</span>
                      )}
                    </div>

                    <div className="mt-5 min-h-[5.5rem]">
                      {/* Precio final con IVA como cifra principal (art. 20 TRLGDCU): un club o
                          asociación puede ser consumidor. La base sin IVA va debajo. */}
                      <p className={cn("font-display tabular text-4xl font-black leading-none", plan.highlight ? "text-white" : "text-mat")}>
                        {plan.priceEurCents === 0
                          ? "0 €"
                          : formatEuroCentsExact(
                              quoteSpanishVat(yearly ? plan.annualPriceEurCents! : plan.priceEurCents).totalCents
                            )}
                        <span className={cn("ml-1 text-lg font-bold", plan.highlight ? "text-white/80" : "text-ramp-500")}>
                          {plan.priceEurCents === 0 ? "" : yearly ? "/año" : "/mes"}
                        </span>
                      </p>
                      {plan.priceEurCents === 0 ? null : (
                        <p className={cn("tabular mt-1.5 text-xs", plan.highlight ? "text-white/80" : "text-ramp-600")}>
                          IVA ({SPANISH_VAT_GENERAL_RATE_PERCENT} %) incluido · {formatPlanAmount(yearly ? plan.annualPriceEurCents! : plan.priceEurCents)} + IVA
                        </p>
                      )}
                      <p className={cn("mt-2 text-sm", plan.highlight ? "text-white/85" : "text-ramp-600")}>
                        {yearly
                          ? `${euroExact.format(quoteSpanishVat(plan.annualPriceEurCents!).totalCents / 1200)}/mes equivalente · ahorras ${formatEuroCentsExact(quoteSpanishVat(plan.priceEurCents).totalCents * 2)}`
                          : plan.description}
                      </p>
                    </div>

                    <dl className={cn("mt-6 border-t-[3px]", plan.highlight ? "border-white" : "border-mat-night")}>
                      {LIMIT_ROWS.map((row) => (
                        <div
                          key={row.label}
                          className={cn("flex items-baseline justify-between gap-3 border-b py-2.5 text-sm", plan.highlight ? "border-white/20" : "border-chalk-line")}
                        >
                          <dt className={plan.highlight ? "text-white/80" : "text-ramp-600"}>{row.label}</dt>
                          <dd className="tabular font-bold">{row.get(plan)}</dd>
                        </div>
                      ))}
                    </dl>

                    <ul className={cn("mt-5 space-y-2.5 text-sm leading-relaxed", plan.highlight ? "text-white/90" : "text-ramp-600")}>
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2.5">
                          <span aria-hidden className={cn("mt-2 h-1.5 w-3 shrink-0", plan.highlight ? "bg-white" : "bg-mat")} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 pt-0 lg:p-7 lg:pt-0">
                    <TrackedPlanLink
                      href={plan.ctaHref}
                      planCode={plan.planCode}
                      className={cn(
                        "inline-flex min-h-12 w-full items-center justify-center whitespace-nowrap rounded-md px-5 text-sm font-extrabold transition-colors",
                        plan.highlight
                          ? "bg-white text-mat-deep hover:bg-chalk focus-visible:ring-white focus-visible:ring-offset-mat"
                          : "border-2 border-mat-night text-mat-night hover:bg-mat-night hover:text-white"
                      )}
                    >
                      {plan.cta}
                    </TrackedPlanLink>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-sm text-ramp-600">
            {!paidCheckoutOpen
              ? "Durante la apertura, las academias fundadoras usan Starter o Growth sin coste. La contratación con pago se abrirá al cerrar la facturación, con estos precios."
              : interval === "year"
                ? "Importe anual cobrado de una vez. Elige esta modalidad al contratar desde Facturación."
                : "Sin permanencia. Puedes cambiar a pago anual desde Facturación."}
          </p>

          <div className="mt-16 grid gap-10 border-t-[3px] border-mat-night pt-8 md:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title}>
                <h2 className="font-display text-2xl font-extrabold uppercase text-mat-night">{p.title}</h2>
                <p className="mt-2 leading-relaxed text-ramp-600">{p.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-col gap-6 rounded-lg bg-mat-night p-8 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-3xl font-black uppercase">¿Migrar datos o coordinar varias sedes?</h2>
              <p className="mt-2 max-w-2xl text-white/80">
                Empieza por tu cuenta: importa tus gimnastas desde Excel o CSV con vista previa. Si necesitas
                traer otros datos (cuotas, pagos o historial) o coordinar varias sedes, te orientamos por email.
              </p>
            </div>
            <Link
              href="/contact?type=migracion"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-white px-6 text-sm font-extrabold text-mat-night focus-visible:ring-white focus-visible:ring-offset-mat-night"
            >
              Consultar una migración
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
