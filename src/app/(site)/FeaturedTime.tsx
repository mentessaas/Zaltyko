import { CalendarRange, Gauge, ShieldCheck } from "lucide-react";

const features = [
  {
    title: "Tenancy blindado",
    description:
      "Cada academia opera con su propio tenant, políticas RLS en Supabase y auditorías centralizadas para el Súper Admin.",
    icon: ShieldCheck,
  },
  {
    title: "Operaciones en tiempo real",
    description:
      "Dashboard con KPIs de atletas, coaches y clases. Agenda semanal, eventos, cupos y niveles se actualizan al instante.",
    icon: Gauge,
  },
  {
    title: "Agenda inteligente",
    description:
      "Clases por nivel, rotación de aparatos y evaluaciones en un calendario diseñado para gimnasia artística.",
    icon: CalendarRange,
  },
];

export default function FeaturedTime() {
  return (
    <section id="caracteristicas" className="bg-[#0b1417] py-20">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <span className="text-xs uppercase tracking-[0.35em] text-emerald-300">
          Todo en un solo lugar
        </span>
        <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
          Nacimos en la pista, no en una plantilla genérica.
        </h2>
        <p className="mt-4 text-base text-slate-200/80">
          Zaltyko combina operativa diaria, comunicación y cobros para academias que entrenan élite y base. Multi-campus, multi-rol y con reportes listos para federaciones y padres.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left shadow-lg"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 text-xl font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-200/75">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
