import type { ReactNode } from "react";
import Link from "next/link";

import {
  CoveragePill,
  EmptyNote,
  PageIntro,
  Pill,
  SubNav,
  UnavailableNotice,
  ZaltykoStatusPill,
  ciButtonPrimary,
  ciCard,
} from "@/components/competencia/ui";
import {
  BILLING_PERIOD_LABELS,
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPE_LABELS,
  DISCIPLINE_LABELS,
  VAT_MODE_LABELS,
  type BillingPeriod,
  type ClientSize,
  type CompetitorType,
  type Discipline,
  type SectionKey,
  type VatMode,
} from "@/lib/competencia/domain";
import {
  getComparison,
  isCompetitiveIntelligenceAvailable,
  listCompetitorOptions,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readIds(raw: string | string[] | undefined): string[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap(
    (value) => value.split(",")
  );
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => UUID.test(value))
    )
  ).slice(0, 6);
}

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={ciCard}>
      <h2 className="font-semibold text-white">{caption}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-white/50">
            {head}
          </thead>
          <tbody className="align-top text-white/80">{children}</tbody>
        </table>
      </div>
    </section>
  );
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="Inteligencia competitiva" title="Comparar" />
        <UnavailableNotice />
      </div>
    );
  }
  const ids = readIds((await searchParams).ids);
  const [options, comparison] = await Promise.all([
    listCompetitorOptions(),
    getComparison(ids),
  ]);
  const { competitors, sections, pricing, flows, coverage } = comparison;
  const sectionText = (competitorId: string, key: SectionKey) =>
    sections
      .find(
        (section) =>
          section.competitorId === competitorId && section.section === key
      )
      ?.content.trim() || null;
  const headRow = (first: string, zaltyko = false) => (
    <tr>
      <th scope="col" className="w-44 py-2 pr-3">
        {first}
      </th>
      {zaltyko ? (
        <th scope="col" className="py-2 pr-3">
          Zaltyko
        </th>
      ) : null}
      {competitors.map((competitor) => (
        <th key={competitor.id} scope="col" className="py-2 pr-3">
          <Link
            href={`/super-admin/competencia/${competitor.slug}`}
            className="text-white hover:underline"
          >
            {competitor.name}
          </Link>
        </th>
      ))}
    </tr>
  );
  const pending = (
    <span className="italic text-white/40">Pendiente de investigar</span>
  );

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Inteligencia competitiva" title="Comparar empresas">
        Elige hasta seis empresas para comparar segmentos, precios, mensajes,
        canales y funciones. Zaltyko aparece como referencia en los flujos.
      </PageIntro>
      <SubNav active="comparar" />

      <form method="get" className={`${ciCard} space-y-3`}>
        <fieldset>
          <legend className="text-sm font-medium text-white">Empresas</legend>
          {options.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">
              No hay competidores activos.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((option) => (
                <label
                  key={option.id}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
                >
                  <input
                    type="checkbox"
                    name="ids"
                    value={option.id}
                    defaultChecked={ids.includes(option.id)}
                    className="h-4 w-4"
                  />
                  {option.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <button type="submit" className={ciButtonPrimary}>
          Comparar
        </button>
      </form>

      {competitors.length === 0 ? (
        <EmptyNote title="Elige al menos una empresa">
          La comparación aparece aquí. Puedes guardar el enlace para volver a
          ella.
        </EmptyNote>
      ) : (
        <>
          <Table caption="Segmento" head={headRow("Dato")}>
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                Tipo
              </th>
              {competitors.map((competitor) => (
                <td key={competitor.id} className="py-2 pr-3">
                  {
                    COMPETITOR_TYPE_LABELS[
                      competitor.competitorType as CompetitorType
                    ]
                  }
                </td>
              ))}
            </tr>
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                Países y disciplinas
              </th>
              {competitors.map((competitor) => (
                <td key={competitor.id} className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {competitor.countries.map((country) => (
                      <Pill key={country}>{country}</Pill>
                    ))}
                    {competitor.disciplines.map((discipline) => (
                      <Pill key={discipline}>
                        {DISCIPLINE_LABELS[discipline as Discipline] ??
                          discipline}
                      </Pill>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                Tamaño de cliente
              </th>
              {competitors.map((competitor) => (
                <td key={competitor.id} className="py-2 pr-3">
                  {competitor.clientSizes
                    .map(
                      (size) => CLIENT_SIZE_LABELS[size as ClientSize] ?? size
                    )
                    .join(" · ") || pending}
                </td>
              ))}
            </tr>
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                ICP
              </th>
              {competitors.map((competitor) => (
                <td key={competitor.id} className="py-2 pr-3">
                  {sectionText(competitor.id, "icp") ?? pending}
                </td>
              ))}
            </tr>
          </Table>

          <Table
            caption="Precios y coste estimado (S = 30 gimnastas / 3 entrenadoras · M = 75 / 5 · L = 150 / 10)"
            head={headRow("Dato")}
          >
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                Planes
              </th>
              {competitors.map((competitor) => {
                const plans = pricing.filter(
                  (plan) => plan.competitorId === competitor.id
                );
                return (
                  <td key={competitor.id} className="py-2 pr-3">
                    {plans.length === 0
                      ? pending
                      : plans.map((plan) => (
                          <p key={plan.id}>
                            <span className="text-white">{plan.planName}</span>:{" "}
                            {plan.priceAmount === null
                              ? "no publicado"
                              : `${Number(plan.priceAmount).toLocaleString("es-ES")} ${plan.currency}`}{" "}
                            {
                              BILLING_PERIOD_LABELS[
                                plan.billingPeriod as BillingPeriod
                              ]
                            }{" "}
                            · {VAT_MODE_LABELS[plan.vatMode as VatMode]}
                            {plan.limitsText ? (
                              <span className="block text-xs text-white/50">
                                {plan.limitsText}
                              </span>
                            ) : null}
                          </p>
                        ))}
                  </td>
                );
              })}
            </tr>
            {(
              ["estimateSmall", "estimateMedium", "estimateLarge"] as const
            ).map((field, index) => (
              <tr key={field} className="border-t border-white/10">
                <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                  Club {["S", "M", "L"][index]}
                </th>
                {competitors.map((competitor) => {
                  const values = pricing
                    .filter(
                      (plan) =>
                        plan.competitorId === competitor.id && plan[field]
                    )
                    .map((plan) => `${plan.planName}: ${plan[field]}`);
                  return (
                    <td key={competitor.id} className="py-2 pr-3 text-xs">
                      {values.length ? (
                        values.join(" · ")
                      ) : (
                        <span className="italic text-white/40">
                          Sin estimación
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                Comisiones
              </th>
              {competitors.map((competitor) => {
                const fees = Array.from(
                  new Set(
                    pricing
                      .filter(
                        (plan) =>
                          plan.competitorId === competitor.id && plan.feesText
                      )
                      .map((plan) => plan.feesText)
                  )
                );
                return (
                  <td key={competitor.id} className="py-2 pr-3 text-xs">
                    {fees.length ? (
                      fees.join(" · ")
                    ) : (
                      <span className="italic text-white/40">No indicadas</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </Table>

          <Table caption="Mensajes y canales" head={headRow("Dato")}>
            {(
              [
                ["posicionamiento", "Posicionamiento"],
                ["promesas", "Promesas"],
                ["captacion", "Canales de captación"],
                ["fortalezas", "Fortalezas"],
                ["debilidades", "Debilidades"],
              ] as Array<[SectionKey, string]>
            ).map(([key, label]) => (
              <tr key={key} className="border-t border-white/10">
                <th scope="row" className="py-2 pr-3 font-medium text-white/60">
                  {label}
                </th>
                {competitors.map((competitor) => (
                  <td key={competitor.id} className="py-2 pr-3">
                    {sectionText(competitor.id, key) ?? pending}
                  </td>
                ))}
              </tr>
            ))}
          </Table>

          <Table caption="Funciones por flujo" head={headRow("Flujo", true)}>
            {flows.map((flow) => (
              <tr key={flow.id} className="border-t border-white/10">
                <th scope="row" className="py-2 pr-3 font-medium text-white/80">
                  {flow.name}
                </th>
                <td className="py-2 pr-3">
                  <ZaltykoStatusPill status={flow.zaltykoStatus} />
                </td>
                {competitors.map((competitor) => {
                  const row = coverage.find(
                    (item) =>
                      item.competitorId === competitor.id &&
                      item.flowId === flow.id
                  );
                  return (
                    <td key={competitor.id} className="py-2 pr-3">
                      <CoveragePill coverage={row?.coverage ?? "desconocido"} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
