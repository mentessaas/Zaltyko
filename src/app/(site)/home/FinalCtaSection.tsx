"use client";

import { Sparkles, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { EmailCapture } from "@/components/EmailCapture";

const benefits = [
  "Puesta en marcha guiada",
  "Para artística femenina, masculina y rítmica",
  "Cobros, horarios y familias en orden",
  "Aislamiento de datos por academia",
];

export default function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-zaltyko-navy py-24">
      {/* Textura de marca */}
      <div className="absolute inset-0 zaltyko-motion-lines opacity-60" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-5 py-2 text-sm font-medium text-white/90 mb-8">
          <Sparkles className="w-4 h-4" />
          Gratis hasta 30 gimnastas · Sin tarjeta
        </div>

        {/* H2 */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
          ¿Listo para dirigir tu academia con más control?
        </h2>

        {/* Subtitle */}
        <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
          Ordena grupos, horarios, cobros, familias y seguimiento técnico en una plataforma pensada para gimnasia artística y rítmica.
        </p>

        {/* Benefits */}
        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-2 text-white/90">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
              {benefit}
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/register?role=owner"
            className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-zaltyko-teal px-10 py-5 text-lg font-bold text-white shadow-brand transition-all duration-200 hover:bg-primary-dark hover:shadow-lift hover:-translate-y-0.5"
          >
            <Sparkles className="w-5 h-5" />
            Crea tu academia gratis
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white font-bold px-10 py-5 rounded-2xl border border-white/20 hover:bg-white/20 transition-all duration-300 text-lg"
          >
            Ver planes y precios
          </Link>
        </div>

        {/* Email Capture */}
        <div className="mt-8 p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
          <p className="text-white/80 text-sm mb-4">
            ¿Quieres recibir ideas de gestión para academias de artística y rítmica?
          </p>
          <EmailCapture
            source="final_cta"
            variant="inline"
            placeholder="tu@email.com"
            buttonText="Suscribirme"
          />
        </div>

        {/* Trust */}
        <p className="mt-8 text-white/60 text-sm">
          Trabajáis con datos de menores: cada academia está aislada y cada rol ve solo lo suyo.
        </p>
      </div>
    </section>
  );
}
