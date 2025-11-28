import Link from "next/link";
import { ArrowRight, PlayCircle, CheckCircle2 } from "lucide-react";
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
      <div className="absolute top-20 right-0 -z-10 h-[600px] w-[600px] rounded-full bg-zaltyko-primary/10 blur-[140px]" />
      <div className="absolute bottom-0 left-0 -z-10 h-[400px] w-[400px] rounded-full bg-zaltyko-accent-teal/8 blur-[100px]" />
      
      {/* Decorative grid pattern */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8B5CF610_1px,transparent_1px),linear-gradient(to_bottom,#8B5CF610_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/20 bg-white/60 px-4 py-2 text-sm font-medium text-zaltyko-primary backdrop-blur-sm shadow-soft mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zaltyko-accent-teal opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zaltyko-accent-teal"></span>
            </span>
            Software especializado para gimnasia artística, rítmica y acrobática
          </div>

          {/* H1 - SEO Optimizado */}
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-zaltyko-text-main sm:text-5xl lg:text-6xl">
            El software definitivo para{" "}
            <span className="text-gradient">academias de gimnasia</span>
          </h1>

          {/* Subtítulo descriptivo */}
          <p className="mt-6 mx-auto max-w-3xl text-lg text-zaltyko-text-secondary sm:text-xl leading-relaxed">
            Gestiona atletas, clases, pagos, eventos y comunicación desde un solo panel 
            diseñado exclusivamente para gimnasia artística, rítmica y acrobática. 
            Simplifica la administración de tu club deportivo y enfócate en lo que importa: 
            el desarrollo de tus atletas.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "shadow-glow hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all duration-300 text-base px-8 py-6"
              )}
            >
              Crear mi academia gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="#como-funciona"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "bg-white/60 backdrop-blur-sm hover:bg-white/80 text-base px-8 py-6"
              )}
            >
              <PlayCircle className="mr-2 h-5 w-5" />
              Ver cómo funciona
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-4">
            {trustIndicators.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-medium text-zaltyko-text-secondary">
                <CheckCircle2 className="h-5 w-5 text-zaltyko-accent-teal" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Hero Visual - Dashboard Preview */}
        <div className="mt-16 mx-auto max-w-5xl">
          <div className="relative">
            {/* Glow effect behind dashboard */}
            <div className="absolute -inset-4 bg-gradient-to-r from-zaltyko-primary/20 via-zaltyko-accent-teal/20 to-zaltyko-primary/20 rounded-3xl blur-2xl opacity-60" />
            
            {/* Dashboard mockup */}
            <div className="relative glass-panel rounded-2xl p-2 sm:p-3">
              <div className="rounded-xl bg-white border border-zaltyko-border overflow-hidden shadow-medium">
                {/* Browser bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-zaltyko-bg border-b border-zaltyko-border">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="max-w-md mx-auto bg-white rounded-md px-3 py-1.5 text-xs text-zaltyko-text-secondary border border-zaltyko-border">
                      app.zaltyko.com/dashboard
                    </div>
                  </div>
                </div>
                
                {/* Dashboard content preview */}
                <div className="p-6 bg-zaltyko-bg/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: "Atletas activos", value: "127", color: "text-zaltyko-primary" },
                      { label: "Clases hoy", value: "8", color: "text-zaltyko-accent-teal" },
                      { label: "Pagos pendientes", value: "€2,450", color: "text-zaltyko-accent-amber" },
                      { label: "Asistencia", value: "94%", color: "text-green-600" },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white rounded-xl p-4 border border-zaltyko-border">
                        <p className="text-xs text-zaltyko-text-secondary mb-1">{stat.label}</p>
                        <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-white rounded-xl p-4 border border-zaltyko-border">
                      <p className="text-sm font-semibold text-zaltyko-text-main mb-3">Próximas clases</p>
                      <div className="space-y-2">
                        {["Gimnasia Artística - Nivel Intermedio", "Rítmica Juvenil - Grupo A", "Acrobática Competición"].map((clase, i) => (
                          <div key={clase} className="flex items-center justify-between py-2 border-b border-zaltyko-border last:border-0">
                            <span className="text-sm text-zaltyko-text-secondary">{clase}</span>
                            <span className="text-xs px-2 py-1 bg-zaltyko-primary/10 text-zaltyko-primary rounded-full">
                              {["09:00", "11:30", "16:00"][i]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-zaltyko-border">
                      <p className="text-sm font-semibold text-zaltyko-text-main mb-3">Actividad reciente</p>
                      <div className="space-y-3">
                        {[
                          "Nueva inscripción: María G.",
                          "Pago recibido: €85",
                          "Clase completada: Elite",
                        ].map((activity) => (
                          <div key={activity} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-zaltyko-accent-teal" />
                            <span className="text-xs text-zaltyko-text-secondary">{activity}</span>
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

