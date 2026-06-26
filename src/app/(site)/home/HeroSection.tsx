"use client";

import Link from "next/link";
import { ArrowRight, Play, Check, Sparkles, Users, Calendar, CreditCard, TrendingUp, Star, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    title: "Gimnastas y niveles",
    description: "Fichas claras con nivel, categoría, aparatos, rutinas y seguimiento técnico",
    icon: Users,
    color: "from-zaltyko-indigo to-zaltyko-teal",
  },
  {
    title: "Grupos y horarios",
    description: "Organiza entrenamientos por grupo, aforo, entrenadora y asistencia",
    icon: Calendar,
    color: "from-teal-500 to-emerald-600",
  },
  {
    title: "Cobros claros",
    description: "Controla cuotas, pagos pendientes y familias sin perseguir mensajes",
    icon: CreditCard,
    color: "from-zaltyko-indigo to-zaltyko-coral",
  },
  {
    title: "Dirección diaria",
    description: "Una vista simple para decidir qué pasa hoy en tu academia",
    icon: TrendingUp,
    color: "from-violet-500 to-purple-600",
  },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-white">
      {/* Background: textura de marca + un único orbe de profundidad */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 zaltyko-motion-lines opacity-80" />
        <div className="absolute -top-32 right-0 h-[720px] w-[720px] rounded-full bg-gradient-to-br from-zaltyko-electric/10 via-zaltyko-teal/5 to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(203,213,225,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(203,213,225,0.12)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/20 bg-zaltyko-teal/10 px-4 py-1.5 text-sm font-medium text-zaltyko-indigo">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zaltyko-teal opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zaltyko-teal"></span>
              </span>
              Para gimnasia artística femenina, masculina y rítmica
            </div>

            {/* H1 */}
            <h1 className="mb-6 font-display text-5xl font-bold leading-[1.02] tracking-tight text-zaltyko-navy sm:text-6xl lg:text-[5rem]">
              Dirige tu academia de gimnasia{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-zaltyko-indigo via-zaltyko-teal to-zaltyko-electric">
                con orden, cobros claros y menos improvisación
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mb-8 max-w-xl text-xl leading-relaxed text-zaltyko-text-secondary">
              Zaltyko ayuda a academias de artística femenina, artística masculina y rítmica a ordenar grupos, horarios, familias, pagos y progreso técnico desde un solo lugar.
            </p>

            {/* CTAs */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Link
                  href="/contact?type=demo"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "group bg-zaltyko-teal px-8 py-6 text-base text-white shadow-brand transition-all duration-200 hover:bg-primary-dark hover:shadow-lift"
                  )}
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  Solicitar demo
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="#demo"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "border-zaltyko-mist bg-white px-8 py-6 text-base text-zaltyko-indigo hover:border-zaltyko-indigo/35 hover:bg-zaltyko-white"
                  )}
                >
                  <Play className="mr-2 h-5 w-5 text-zaltyko-teal" />
                  Ver demo en 2 min
                </Link>
              </div>
              {/* Microcopy bajo CTA */}
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zaltyko-text-secondary">
                <span className="flex items-center gap-1">
                  <Shield className="h-4 w-4 text-zaltyko-teal" /> Sin tarjeta de crédito
                </span>
                <span>·</span>
                <span>Puesta en marcha guiada</span>
                <span>·</span>
                <span>Sin compromiso</span>
              </p>
            </div>
          </div>

          {/* Right Content - Features */}
          <div className="relative">
            {/* Features grid */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, i) => (
                <div
                  key={feature.title}
                  className={cn(
                    "group card-hover animate-fadeInUp rounded-2xl border border-zaltyko-mist/70 bg-white/90 p-4 shadow-soft hover:border-zaltyko-teal/30",
                    i === 1 && "delay-75",
                    i === 2 && "delay-150",
                    i === 3 && "delay-225"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110", feature.color)}>
                    <feature.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-zaltyko-navy transition-colors group-hover:text-zaltyko-indigo">
                    {feature.title}
                  </h3>
                  <p className="text-xs leading-snug text-zaltyko-text-secondary">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 bg-white rounded-2xl p-3 shadow-xl border border-gray-100 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-gray-700">Demo guiada</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
