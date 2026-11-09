import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ChalkTally } from "@/components/mat/ChalkTally";
import { DisclosureAccordion } from "@/components/ui/disclosure-accordion";
import { PRODUCT_PLANS, formatPlanAmount } from "@/lib/plans/catalog";
import { cn } from "@/lib/utils";

import { ESSENTIAL_FAQS, ESSENTIAL_FEATURES } from "@/lib/launch/essential-public-catalog";

/* ─────────────────────────────────────────────────────────────────────────
   La tarde en pista: el panel de dirección contado como una pizarra de
   sesiones. Datos de ejemplo, rotulados como tales.
   ───────────────────────────────────────────────────────────────────────── */

const SAMPLE_SESSIONS = [
  { time: "16:30", group: "Iniciación GAF", place: "Pista 2 · Suelo y barra", present: 11, capacity: 14, state: "done" as const },
  { time: "17:00", group: "Rítmica Pre-benjamín", place: "Tapiz rítmica", present: 9, capacity: 12, state: "done" as const },
  { time: "17:30", group: "Base 3 GAF", place: "Pista 1 · Suelo", present: 7, capacity: 10, state: "live" as const },
  { time: "18:30", group: "Competición GAM", place: "Anillas y paralelas", present: 0, capacity: 8, state: "next" as const },
  { time: "19:00", group: "Adultos", place: "Pista 2 · Suelo", present: 0, capacity: 14, state: "next" as const },
];

const STATE_LABEL = { done: "Lista pasada", live: "En pista", next: "Próxima" } as const;

// Solo lo que el lanzamiento ya calcula: listas por pasar de las sesiones de
// hoy, cuotas emitidas pendientes e inscripciones por estado.
const SAMPLE_PENDING = [
  { tone: "signal" as const, title: "2 cuotas de octubre pendientes", detail: "Emitidas a familias de Base 3 y Rítmica" },
  { tone: "mat" as const, title: "2 listas por pasar", detail: "Competición GAM y Adultos, esta tarde" },
  { tone: "mat" as const, title: "3 inscripciones en prueba", detail: "Iniciación GAF y Rítmica Pre-benjamín" },
];

export function AfternoonBoard() {
  return (
    <section aria-labelledby="afternoon-title" className="chalk-field border-b border-chalk-line">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
          <h2
            id="afternoon-title"
            className="font-display text-[clamp(2.25rem,5vw,4rem)] font-black uppercase leading-[0.92] text-mat-night"
          >
            Una tarde de club,
            <br />
            vista desde dirección
          </h2>
          <p className="max-w-xl text-lg leading-relaxed text-ramp-600 lg:justify-self-end">
            A las 17:30 sabes qué grupo está en pista, cuántas gimnastas han venido y qué queda
            pendiente antes de cerrar. Sin abrir el Excel ni buscar en el chat.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-lg border border-chalk-line bg-white shadow-soft">
            <div className="flex items-center justify-between border-b-[3px] border-mat px-5 py-3">
              <p className="floor-label text-mat">Sesiones de hoy</p>
              <p className="text-xs font-medium text-ramp-500">Datos de ejemplo</p>
            </div>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Sesiones de una tarde de ejemplo</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Grupo</th>
                  <th scope="col">Asistencia</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_SESSIONS.map((s) => (
                  <tr
                    key={s.time}
                    className={cn("border-b border-chalk-line last:border-b-0", s.state === "live" && "bg-mat-wash")}
                  >
                    <td className="w-20 py-4 pl-5 align-top">
                      <span className="font-display tabular text-2xl font-extrabold leading-none text-mat-night">{s.time}</span>
                    </td>
                    <td className="py-4 pr-3 align-top">
                      <p className="font-semibold text-mat-night">{s.group}</p>
                      <p className="text-ramp-500">{s.place}</p>
                    </td>
                    <td className="hidden py-4 pr-3 align-middle text-mat sm:table-cell">
                      {s.state === "next" ? (
                        <span className="text-ramp-500">{s.capacity} plazas</span>
                      ) : (
                        <span className="inline-flex items-center gap-3">
                          <ChalkTally count={s.present} className="h-6" animate={false} label={`${s.present} presentes`} />
                          <span className="tabular font-semibold text-mat-night">
                            {s.present}/{s.capacity}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-5 text-right align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-2 py-1 text-xs font-bold uppercase tracking-[0.06em]",
                          s.state === "live" && "bg-mat text-white",
                          s.state === "done" && "bg-chalk-dust text-ramp-600",
                          s.state === "next" && "border border-ramp-300 text-ramp-600"
                        )}
                      >
                        {STATE_LABEL[s.state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="floor-label text-ramp-600">Pendiente hoy</p>
            <ul className="mt-4 divide-y divide-chalk-line border-y border-chalk-line">
              {SAMPLE_PENDING.map((item) => (
                <li key={item.title} className="flex gap-4 py-5">
                  <span
                    aria-hidden
                    className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", item.tone === "signal" ? "bg-signal" : "bg-mat dark:bg-mat-lane")}
                  />
                  <div>
                    <p className="font-semibold text-mat-night">{item.title}</p>
                    <p className="text-sm text-ramp-500">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ramp-500">Vista ilustrativa con datos ficticios.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Módulos: una lista reglada como la hoja de aparatos, no una rejilla de
   tarjetas.
   ───────────────────────────────────────────────────────────────────────── */

// Fuente única con el catálogo público del lanzamiento: lo que aquí se lee es
// lo mismo que publican los datos estructurados y la página de producto.
const MODULES = ESSENTIAL_FEATURES.map((f) => ({
  name: f.label,
  text: `${f.features.join(". ")}. ${f.impact}.`,
}));

export function ModuleRegister() {
  return (
    <section aria-labelledby="modules-title" className="bg-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-14 lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2
            id="modules-title"
            className="font-display text-[clamp(2.25rem,5vw,4rem)] font-black uppercase leading-[0.92] text-mat-night"
          >
            Habla
            <br />
            gimnasia
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ramp-600">
            Gimnastas, familias, grupos y sesiones. No socios ni membresías de un CRM genérico.
          </p>
          <Link
            href="/features"
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md text-base font-bold text-mat underline decoration-2 underline-offset-[6px] hover:decoration-[3px]"
          >
            Ver todo el producto
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>

        <dl className="border-t-[3px] border-mat-night">
          {MODULES.map((m) => (
            <div
              key={m.name}
              className="grid gap-1 border-b border-chalk-line py-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
            >
              <dt className="font-display text-xl font-extrabold uppercase leading-tight text-mat">{m.name}</dt>
              <dd className="leading-relaxed text-ramp-600">{m.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Antes / con Zaltyko: dos columnas regladas, sin iconos de tick.
   ───────────────────────────────────────────────────────────────────────── */

const BEFORE_AFTER = [
  ["Una hoja de asistencia por grupo, rellenada al final del día", "Asistencia por sesión desde el móvil, en la pista"],
  ["Cuotas apuntadas en una libreta y pagos sin rastro", "Cuotas mensuales por familia: lo emitido, lo pendiente y lo recibido"],
  ["Grupos y horarios en una pestaña distinta del Excel", "Grupos y clases por sede, con horario y capacidad"],
  ["Datos de familias repartidos entre carpetas y chats", "Cada gimnasta con su familia y sus responsables en una ficha"],
];

export function BeforeAfter() {
  return (
    <section aria-labelledby="ba-title" className="mat-field-deep">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14 lg:py-24">
        <h2 id="ba-title" className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-white">
          De Excel y WhatsApp a la pista
        </h2>
        <div className="mt-10 grid border-t-[3px] border-white sm:grid-cols-2">
          <p className="floor-label hidden py-4 text-mat-lane sm:block">Hoy en muchos clubes</p>
          <p className="floor-label hidden py-4 text-white sm:block sm:pl-8">Con Zaltyko</p>
          {BEFORE_AFTER.map(([before, after]) => (
            <div key={before} className="contents">
              <p className="border-t border-white/15 py-5 text-white/70 sm:pr-8">
                <span className="sr-only">Antes: </span>
                {before}
              </p>
              <p className="border-t border-white/15 py-5 font-semibold text-white sm:border-l sm:pl-8">
                <span className="sr-only">Con Zaltyko: </span>
                {after}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Planes: una línea reglada por plan, con las cifras reales del catálogo.
   ───────────────────────────────────────────────────────────────────────── */

export function PlansLine() {
  return (
    <section aria-labelledby="plans-title" className="bg-white">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="plans-title" className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night">
            Un plan por etapa de academia
          </h2>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center gap-2 text-base font-bold text-mat underline decoration-2 underline-offset-[6px]"
          >
            Comparar planes
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        <ul className="mt-10 grid border-t-[3px] border-mat-night sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_PLANS.map((plan, i) => (
            <li
              key={plan.code}
              className={cn(
                "border-b border-chalk-line py-6 sm:px-6 sm:first:pl-0 lg:border-b-0",
                i > 0 && "lg:border-l",
                plan.highlight && "lg:bg-mat-wash"
              )}
            >
              <p className="font-display text-2xl font-extrabold uppercase text-mat-night">{plan.publicName}</p>
              <p className="font-display tabular mt-2 text-4xl font-black text-mat">
                {plan.code === "network" ? <span className="mr-1 text-base font-bold text-ramp-500">desde</span> : null}
                {plan.priceEurCents === 0 ? "0 €" : formatPlanAmount(plan.priceEurCents)}
                <span className="text-base font-bold text-ramp-500">{plan.priceEurCents === 0 ? "" : "/mes"}</span>
              </p>
              <p className="mt-2 text-sm font-medium text-ramp-600">{plan.shortDescription}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ramp-600">
          Precios sin IVA. 7 días de Starter sin tarjeta, una activación por academia cada 12 meses.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Preguntas frecuentes sobre <details> nativo (contenido indexable).
   ───────────────────────────────────────────────────────────────────────── */

export function MatFaq() {
  const items = ESSENTIAL_FAQS.map((faq, i) => ({ id: `faq-${i}`, title: faq.question, content: <p>{faq.answer}</p> }));
  return (
    <section aria-labelledby="faq-title" className="chalk-field border-y border-chalk-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-14 lg:py-28">
        <div>
          <h2 id="faq-title" className="font-display text-[clamp(2.25rem,5vw,4rem)] font-black uppercase leading-[0.92] text-mat-night">
            Preguntas
            <br />
            de dirección
          </h2>
          <p className="mt-6 max-w-sm text-ramp-600">
            ¿Otra duda?{" "}
            <a href="mailto:hola@zaltyko.com" className="font-semibold text-mat underline decoration-2">
              hola@zaltyko.com
            </a>
            . Atención por email en días laborables.
          </p>
        </div>
        <DisclosureAccordion
          items={items}
          defaultOpen={["faq-1"]}
          className="rounded-none border-x-0 border-b-0 border-t-[3px] border-t-mat-night bg-transparent"
          classNames={{
            item: "bg-transparent open:bg-white/70",
            trigger: "px-0 py-5 text-lg font-bold text-mat-night hover:bg-transparent group-open:text-mat sm:px-2",
            marker: "text-mat",
            content: "px-0 pb-6 text-base leading-relaxed text-ramp-600 sm:px-2",
          }}
        />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Cierre: de vuelta al tapiz.
   ───────────────────────────────────────────────────────────────────────── */

export function MatClose() {
  return (
    <section aria-labelledby="close-title" className="mat-field relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-3 border-[3px] border-white/80 sm:inset-6" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-8 px-8 py-24 sm:px-14 lg:flex-row lg:items-end lg:justify-between lg:py-28">
        <h2
          id="close-title"
          className="font-display max-w-3xl text-[clamp(2.5rem,6.5vw,5.5rem)] font-black uppercase leading-[0.9] text-white"
        >
          Esta tarde, pasa lista en la pista.
        </h2>
        <div className="flex flex-col gap-3">
          <Link
            href="/auth/register?role=owner"
            className="inline-flex min-h-14 items-center justify-center rounded-md bg-white px-8 text-base font-extrabold text-mat-deep focus-visible:ring-white focus-visible:ring-offset-mat"
          >
            Crear academia gratis
          </Link>
          <p className="text-sm text-white/80">Gratis hasta 30 gimnastas. Sin tarjeta.</p>
        </div>
      </div>
    </section>
  );
}
