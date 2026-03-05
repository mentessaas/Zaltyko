import Link from "next/link";
import { ArrowRight, PlayCircle, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const trustIndicators = [
  "Sin tarjeta de crédito",
  "Configuración en 5 minutos",
  "Soporte incluido",
];

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10 bg-hero-glow opacity-30 blur-3xl" />
      <div className="absolute top-20 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-zaltyko-primary/15 blur-[140px]" />
      <div className="absolute bottom-0 left-0 -z-10 h-[400px] w-[400px] rounded-full bg-zaltyko-accent-teal/10 blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-[800px] w-[800px] rounded-full bg-gradient-to-tr from-zaltyko-primary/5 to-transparent blur-[120px]" />

      {/* Decorative grid pattern */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8B5CF610_1px,transparent_1px),linear-gradient(to_bottom,#8B5CF610_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/20 bg-white/80 px-5 py-2.5 text-sm font-semibold text-zaltyko-primary backdrop-blur-sm shadow-lg shadow-zaltyko-primary/10 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zaltyko-accent-teal opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zaltyko-accent-teal"></span>
            </span>
            Software especializado para gimnasia artística, rítmica y acrobática
          </div>

          {/* H1 - SEO Optimizado */}
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-zaltyko-text-main sm:text-5xl lg:text-7xl animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            El software definitivo para{" "}
            <span className="text-gradient">academias de gimnasia</span>
          </h1>

          {/* Subtítulo descriptivo */}
          <p className="mt-6 mx-auto max-w-3xl text-lg text-zaltyko-text-secondary sm:text-xl leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
            Gestiona atletas, clases, pagos, eventos y comunicación desde un solo panel
            diseñado exclusivamente para gimnasia artística, rítmica y acrobática.
            Simplifica la administración de tu club deportivo y enfócate en lo que importa:
            el desarrollo de tus atletas.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "shadow-glow hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all duration-300 text-base px-8 py-6 group"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5 group-hover:animate-pulse" />
              Crear mi academia gratis
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="#como-funciona"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "bg-white/60 backdrop-blur-sm hover:bg-white/80 text-base px-8 py-6 border-zaltyko-primary/20 hover:border-zaltyko-primary/40"
              )}
            >
              <PlayCircle className="mr-2 h-5 w-5" />
              Ver cómo funciona
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-4 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-400">
            {trustIndicators.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-semibold text-zaltyko-text-secondary">
                <CheckCircle2 className="h-5 w-5 text-zaltyko-accent-teal" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Hero Visual - Dashboard Preview */}
        <div className="mt-16 mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          <div className="relative">
            {/* Glow effect behind dashboard */}
            <div className="absolute -inset-6 bg-gradient-to-r from-zaltyko-primary/30 via-zaltyko-accent-teal/20 to-zaltyko-primary/30 rounded-3xl blur-3xl opacity-70" />

            {/* Dashboard mockup */}
            <div className="relative glass-panel rounded-2xl p-2 sm:p-3 shadow-2xl">
              <div className="rounded-xl bg-white border border-zaltyko-border/60 overflow-hidden shadow-xl">
                {/* Browser bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-b from-zaltyko-bg to-white border-b border-zaltyko-border/60">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-green-400 shadow-sm" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="max-w-md mx-auto bg-white/80 rounded-lg px-4 py-2 text-sm font-medium text-zaltyko-text-secondary border border-zaltyko-border/50 shadow-sm">
                      app.zaltyko.com/dashboard
                    </div>
                  </div>
                </div>

                {/* Dashboard content preview */}
                <div className="p-6 bg-gradient-to-br from-zaltyko-bg/80 to-white">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: "Atletas activos", value: "127", color: "text-zaltyko-primary", icon: "👥" },
                      { label: "Clases hoy", value: "8", color: "text-zaltyko-accent-teal", icon: "📅" },
                      { label: "Pagos pendientes", value: "€2,450", color: "text-zaltyko-accent-amber", icon: "💰" },
                      { label: "Asistencia", value: "94%", color: "text-green-600", icon: "✅" },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white/80 backdrop-blur rounded-2xl p-4 border border-zaltyko-border/50 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{stat.icon}</span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-zaltyko-text-secondary/80 mb-1">{stat.label}</p>
                        <p className={cn("text-3xl font-bold", stat.color)}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-white/80 backdrop-blur rounded-2xl p-5 border border-zaltyko-border/50 shadow-md">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-2 w-2 rounded-full bg-zaltyko-accent-teal animate-pulse" />
                        <p className="text-sm font-bold text-zaltyko-text-main">Próximas clases</p>
                      </div>
                      <div className="space-y-3">
                        {["Gimnasia Artística - Nivel Intermedio", "Rítmica Juvenil - Grupo A", "Acrobática Competición"].map((clase, i) => (
                          <div key={clase} className="flex items-center justify-between py-3 px-4 bg-gradient-to-r from-zaltyko-bg/50 to-transparent rounded-xl border border-zaltyko-border/30 hover:border-zaltyko-primary/30 hover:shadow-md transition-all duration-300">
                            <span className="text-sm font-medium text-zaltyko-text-secondary">{clase}</span>
                            <span className="text-xs font-bold px-3 py-1.5 bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark text-white rounded-lg shadow-md">
                              {["09:00", "11:30", "16:00"][i]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-zaltyko-border/50 shadow-md">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-2 w-2 rounded-full bg-zaltyko-accent-amber animate-pulse" />
                        <p className="text-sm font-bold text-zaltyko-text-main">Actividad reciente</p>
                      </div>
                      <div className="space-y-3">
                        {[
                          { text: "Nueva inscripción: María G.", emoji: "🎉" },
                          { text: "Pago recibido: €85", emoji: "💚" },
                          { text: "Clase completada: Elite", emoji: "⭐" },
                        ].map((activity) => (
                          <div key={activity.text} className="flex items-center gap-3 py-2">
                            <span className="text-lg">{activity.emoji}</span>
                            <span className="text-xs font-medium text-zaltyko-text-secondary">{activity.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

