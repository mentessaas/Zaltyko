import Link from "next/link";
import { BadgeCheck, Users } from "lucide-react";

const stats = [
  { label: "Academias activas", value: "+120" },
  { label: "Atletas gestionados", value: "18k" },
  { label: "Pagos conciliados", value: "€3.4M" },
];

const sellingPoints = [
  "Control multi-academia con aislamiento por tenant",
  "Tableros en tiempo real para atletas, clases y eventos",
  "Stripe integrado con planes Free, Pro y Premium",
];

export default function HeroSection() {
  return (
    <section className="relative mt-16 overflow-hidden bg-[#0d1b1e]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_#38f9d730,_transparent_60%),radial-gradient(circle_at_bottom,_#9cff6b25,_transparent_55%)]" />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 py-24 md:flex-row md:items-start md:px-6 lg:px-8">
        <div className="flex-1 text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-200">
            <Users className="h-4 w-4" />
            SaaS para gimnasia artística
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-[3.2rem]">
            Gestiona todas tus academias de gimnasia desde un único panel.
          </h1>

          <p className="mt-6 text-lg text-slate-200/90 md:max-w-xl">
            Automatiza altas de atletas, horarios, nómina de coaches y cobros recurrentes. GymnaSaaS centraliza operaciones, métricas y facturación para academias que crecen sin perder control.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-6 py-3 text-sm font-semibold text-[#0d1b1e] transition hover:from-emerald-300 hover:to-lime-200"
            >
              Iniciar onboarding guiado
            </Link>
            <Link
              href="#planes"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Conoce los planes
            </Link>
          </div>

          <ul className="mt-10 space-y-3 text-left text-sm text-slate-200/80">
            {sellingPoints.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="w-full max-w-md flex-1 md:max-w-xs">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
            <div className="rounded-2xl bg-[#132227] p-5">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-200">
                Panel en vivo
              </p>
              <h2 className="mt-3 text-xl font-semibold text-white">
                Vista general de la academia Aurora Elite
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
              Datos ilustrativos. Conecta tu academia y verás métricas reales en segundos.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
