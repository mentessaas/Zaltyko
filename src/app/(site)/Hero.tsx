import Link from "next/link";
import { BadgeCheck, Users, ArrowRight, Sparkles } from "lucide-react";

const stats = [
  { label: "Academias registradas", value: "+120" },
  { label: "Atletas gestionados", value: "18k" },
  { label: "Pagos conciliados", value: "€3.4M" },
];

const sellingPoints = [
  "Aislamiento total por tenant con RLS y cumplimiento RGPD",
  "Operativa en tiempo real: todo se actualiza instantáneamente",
  "Pensado exclusivamente para gimnasia artística y rítmica",
];

export default function HeroSection() {
  return (
    <section className="relative mt-16 overflow-hidden bg-zaltyko-primary">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(66,165,245,0.2),_transparent_60%),radial-gradient(circle_at_bottom,_rgba(251,192,45,0.15),_transparent_55%)]" />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 py-24 md:flex-row md:items-start md:px-6 lg:px-8">
        <div className="flex-1 text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-zaltyko-accent/40 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-zaltyko-accent">
            <Users className="h-4 w-4" />
            SaaS para gimnasia artística
          </span>

          <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-[3.2rem]">
            Zaltyko — El software profesional para academias de gimnasia
          </h1>

          <p className="mt-6 text-lg text-white/90 md:max-w-xl">
            Organiza atletas, grupos, horarios, entrenadores, asistencia y pagos… todo desde un solo panel. Sin Excel. Sin caos. Sin WhatsApp.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="/onboarding"
              className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-8 py-4 text-base font-bold text-zaltyko-primary-dark shadow-lg shadow-zaltyko-accent/30 transition-all duration-300 hover:scale-105 hover:from-zaltyko-accent-light hover:to-zaltyko-accent hover:shadow-xl hover:shadow-zaltyko-accent/40 active:scale-100"
            >
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span>Iniciar demo guiada</span>
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="#planes"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10"
            >
              Conocer planes
            </Link>
          </div>

          <ul className="mt-10 space-y-3 text-left text-sm text-white/80">
            {sellingPoints.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 text-zaltyko-accent" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="w-full max-w-md flex-1 md:max-w-xs">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
            <div className="rounded-2xl bg-zaltyko-primary-dark/50 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zaltyko-accent">
                Vista general del ecosistema Zaltyko
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold text-white">
                Métricas en tiempo real
              </h2>
              <div className="mt-6 space-y-4">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-2xl font-bold text-white">{item.value}</p>
                    <p className="text-xs uppercase tracking-widest text-slate-300/70">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-slate-300/70">
              *(Datos ilustrativos. Al conectar tu academia verás métricas reales en segundos.)
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
