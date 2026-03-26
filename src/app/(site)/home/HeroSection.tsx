"use client";

import Link from "next/link";
import { ArrowRight, Play, Check, Sparkles, Users, Calendar, CreditCard, TrendingUp, Star, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const trustIndicators = [
  { icon: Shield, text: "Sin tarjeta de crédito" },
  { icon: Zap, text: "Configuración en 5 minutos" },
  { icon: Star, text: "Soporte prioritario incluido" },
];

const stats = [
  { value: "150+", label: "Academias", suffix: "activas" },
  { value: "25,000+", label: "Atletas", suffix: "gestionados" },
  { value: "€4.2M", label: "Pagos", suffix: "procesados" },
  { value: "98%", label: "Satisfacción", suffix: "de clientes" },
];

const features = [
  {
    title: "Gestión de Atletas",
    description: "Perfiles completos con historial médico, niveles y evaluaciones técnicas",
    icon: Users,
    color: "from-rose-500 to-red-600",
  },
  {
    title: "Clases & Horarios",
    description: "Programación flexible con control de aforo y asistencia en tiempo real",
    icon: Calendar,
    color: "from-teal-500 to-emerald-600",
  },
  {
    title: "Pagos Automatizados",
    description: "Stripe integrado para cobros recurrentes y gestión de morosos",
    icon: CreditCard,
    color: "from-amber-500 to-orange-600",
  },
  {
    title: "Analytics & Reportes",
    description: "Dashboard con métricas clave y exportación a Excel/PDF",
    icon: TrendingUp,
    color: "from-violet-500 to-purple-600",
  },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-white">
      {/* Premium Background */}
      <div className="absolute inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-red-100 via-rose-50 to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-red-50 via-pink-50 to-transparent rounded-full blur-3xl opacity-60" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fecaca1a_1px,transparent_1px),linear-gradient(to_bottom,#fecaca1a_1px,transparent_1px)] bg-[size:60px_60px]" />
        
        {/* Diagonal accent line */}
        <div className="absolute top-40 right-20 w-[400px] h-[400px] border border-red-100 rounded-full rotate-45 opacity-30" />
        <div className="absolute bottom-20 left-20 w-[300px] h-[300px] border border-rose-100 rounded-full -rotate-12 opacity-40" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-100 px-4 py-1.5 text-sm font-medium text-red-700 mb-8 hover:bg-red-100 transition-colors cursor-pointer">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              #1 Software para Gimnasia en España
            </div>

            {/* H1 */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight text-gray-900 mb-6">
              Gestiona tu academia de gimnasia{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-600 to-red-700">
                sin complicaciones
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-xl">
              La plataforma todo-en-uno para clubes de gimnasia artística, rítmica y acrobática. 
              <strong> 15 horas menos</strong> de trabajo administrativo por semana.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link
                href="/onboarding"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all duration-300 text-base px-8 py-6 group"
                )}
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Empezar gratis
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="#demo"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-700 text-base px-8 py-6"
                )}
              >
                <Play className="mr-2 h-5 w-5 text-red-500" />
                Ver demo
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap gap-6">
              {trustIndicators.map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-gray-600">
                  <item.icon className="h-5 w-5 text-red-500" />
                  <span className="text-sm font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content - Stats & Features */}
          <div className="relative">
            {/* Floating stats cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {stats.map((stat, i) => (
                <div 
                  key={stat.label}
                  className={cn(
                    "bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1",
                    i === 0 && "col-span-2 bg-gradient-to-r from-red-600 to-rose-600 text-white"
                  )}
                >
                  <p className={cn("text-3xl font-bold", i === 0 ? "text-white" : "text-gray-900")}>
                    {stat.value}
                  </p>
                  <p className={cn("text-sm font-medium", i === 0 ? "text-white/80" : "text-gray-500")}>
                    {stat.label} {stat.suffix && <span className="text-gray-400">{stat.suffix}</span>}
                  </p>
                </div>
              ))}
            </div>

            {/* Features grid */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, i) => (
                <div 
                  key={feature.title}
                  className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-100 hover:border-red-100 hover:shadow-md transition-all duration-300 group"
                >
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3", feature.color)}>
                    <feature.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 group-hover:text-red-600 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-gray-500 leading-snug">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 bg-white rounded-2xl p-3 shadow-xl border border-gray-100 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-gray-700">Sistema activo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom - More social proof */}
        <div className="mt-20 pt-10 border-t border-gray-100">
          <p className="text-center text-sm text-gray-500 mb-6">
            <span className="font-semibold text-gray-900">150+ academias</span> ya confían en Zaltyko
          </p>
          <div className="flex items-center justify-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Placeholder logos - using text as placeholder */}
            <div className="flex items-center gap-2 text-gray-400 font-bold text-lg">
              <span className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">G</span>
              Gravity Gym
            </div>
            <div className="flex items-center gap-2 text-gray-400 font-bold text-lg">
              <span className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">E</span>
              Escuela Olímpica
            </div>
            <div className="flex items-center gap-2 text-gray-400 font-bold text-lg">
              <span className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">Z</span>
              Zenith Elite
            </div>
            <div className="flex items-center gap-2 text-gray-400 font-bold text-lg">
              <span className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">A</span>
              Academia Reyes
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
