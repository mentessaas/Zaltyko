import Link from "next/link";
import { BadgeCheck, Users, ArrowRight, Sparkles, TrendingUp, ShieldCheck, Zap, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const stats = [
  { label: "Academias", value: "+120", icon: Users },
  { label: "Atletas", value: "18k", icon: TrendingUp },
  { label: "Procesado", value: "€3.4M", icon: ShieldCheck },
];

const sellingPoints = [
  "Aislamiento total de datos (RLS)",
  "Gestión en tiempo real",
  "Específico para gimnasia",
];

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10 bg-hero-glow opacity-40 blur-3xl" />
      <div className="absolute top-0 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-zaltyko-primary/10 blur-[120px]" />
      <div className="absolute bottom-0 left-0 -z-10 h-[500px] w-[500px] rounded-full bg-zaltyko-accent-teal/10 blur-[100px]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-8 items-center">
          {/* Left Column: Content */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/20 bg-white/50 px-4 py-1.5 text-sm font-medium text-zaltyko-primary backdrop-blur-sm shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zaltyko-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zaltyko-primary"></span>
              </span>
              SaaS especializado para gimnasia
            </div>

            <h1 className="mt-8 font-display text-5xl font-bold leading-tight tracking-tight text-zaltyko-text-main sm:text-6xl lg:text-[4rem]">
              Gestiona tu academia <br />
              <span className="text-gradient">sin caos ni Excel</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-zaltyko-text-secondary sm:text-xl leading-relaxed">
              La plataforma todo-en-uno para academias de gimnasia. Controla atletas, pagos, clases y asistencia desde un panel moderno y fácil de usar.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center w-full sm:w-auto">
              <Link
                href="/onboarding"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full sm:w-auto shadow-glow hover:shadow-glow-hover transition-all duration-300"
                )}
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Empezar prueba gratis
              </Link>
              <Link
                href="#demo"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto bg-white/60 backdrop-blur-sm hover:bg-white/80"
                )}
              >
                <PlayCircle className="mr-2 h-5 w-5" />
                Ver cómo funciona
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-4 lg:justify-start">
              {sellingPoints.map((point) => (
                <div key={point} className="flex items-center gap-2 text-sm font-medium text-zaltyko-text-secondary">
                  <BadgeCheck className="h-5 w-5 text-zaltyko-accent-teal" />
                  {point}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Visuals */}
          <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none perspective-1000">
            {/* Main Glass Card */}
            <div className="relative z-10 glass-panel rounded-3xl p-6 md:p-8 transform transition-transform hover:scale-[1.01] duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm font-medium text-zaltyko-text-secondary">Ingresos Mensuales</p>
                  <h3 className="text-3xl font-display font-bold text-zaltyko-text-main">€12,450.00</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-zaltyko-accent-teal/10 flex items-center justify-center text-zaltyko-accent-teal">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>

              {/* Fake Chart Bars */}
              <div className="flex items-end justify-between gap-2 h-32 mb-6">
                {[40, 65, 45, 80, 55, 90, 75].map((h, i) => (
                  <div key={i} className="w-full bg-zaltyko-primary/10 rounded-t-lg relative group overflow-hidden">
                    <div
                      style={{ height: `${h}%` }}
                      className="absolute bottom-0 w-full bg-gradient-to-t from-zaltyko-primary to-zaltyko-primary-light rounded-t-lg transition-all duration-1000 ease-out group-hover:opacity-90"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-white/50 p-3 text-center border border-white/40">
                    <p className="text-lg font-bold text-zaltyko-text-main">{stat.value}</p>
                    <p className="text-[10px] uppercase tracking-wider text-zaltyko-text-secondary font-semibold">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating Elements */}
            <div className="absolute -top-12 -right-12 z-0 glass-card p-4 rounded-2xl animate-float hidden md:block">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-zaltyko-accent-coral/20 flex items-center justify-center text-zaltyko-accent-coral">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zaltyko-text-secondary">Nueva inscripción</p>
                  <p className="text-sm font-bold text-zaltyko-text-main">Sofía G. (+€45)</p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-8 -left-8 z-20 glass-card p-4 rounded-2xl animate-float-delayed hidden md:block">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-zaltyko-accent-amber/20 flex items-center justify-center text-zaltyko-accent-amber">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zaltyko-text-secondary">Clase activa</p>
                  <p className="text-sm font-bold text-zaltyko-text-main">Grupo Elite (12/15)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
