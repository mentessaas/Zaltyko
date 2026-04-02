"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface ClusterCTASectionProps {
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
}

export default function ClusterCTASection({
  locale,
  modalityLabel,
  countryLabel,
}: ClusterCTASectionProps) {
  const labels = {
    es: {
      badge: "Empieza hoy",
      title: `Transforma la gestion de tu academia de ${modalityLabel}`,
      subtitle:
        "Unete a mas de 85 academias en Espana que ya estan usando Zaltyko para gestionar atletas, clases y competiciones.",
      primaryCta: "Crear mi academia gratis",
      secondaryCta: "Hablar con un experto",
      trust1: "Sin tarjeta de credito",
      trust2: "Configuracion en 5 min",
      trust3: "Soporte incluido",
    },
    en: {
      badge: "Start today",
      title: `Transform your ${modalityLabel} academy management`,
      subtitle:
        "Join 85+ academies in Spain already using Zaltyko to manage athletes, classes and competitions.",
      primaryCta: "Create my academy for free",
      secondaryCta: "Talk to an expert",
      trust1: "No credit card required",
      trust2: "Setup in 5 min",
      trust3: "Support included",
    },
  };

  const t = labels[locale];

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-br from-red-600 via-red-700 to-rose-800">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-black/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-sm font-medium text-white mb-8">
          <Sparkles className="h-4 w-4" />
          {t.badge}
        </div>

        {/* Title */}
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
          {t.title}
        </h2>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-white/80 leading-relaxed mb-10 max-w-2xl mx-auto">
          {t.subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
          <Link
            href="/onboarding"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "bg-white text-red-700 hover:bg-gray-100 shadow-lg hover:shadow-xl transition-all duration-300 text-base px-8 py-6 group"
            )}
          >
            <Sparkles className="mr-2 h-5 w-5" />
            {t.primaryCta}
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/contact"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "border-white/30 text-white hover:bg-white/10 hover:border-white/50 backdrop-blur-sm text-base px-8 py-6"
            )}
          >
            {t.secondaryCta}
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/70">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-400" />
            {t.trust1}
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            {t.trust2}
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-blue-400" />
            {t.trust3}
          </span>
        </div>
      </div>
    </section>
  );
}
