"use client";

import { Sparkles, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { EmailCapture } from "@/components/EmailCapture";

const benefits = [
  "Puesta en marcha guiada",
  "Para artística femenina, masculina y rítmica",
  "Cobros, horarios y familias en orden",
  "Controles de acceso por academia y rol",
];

export default function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-zaltyko-navy py-24">
      {/* Background pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAyIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="absolute inset-0 zaltyko-motion-lines opacity-60" />
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-zaltyko-indigo/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-zaltyko-teal/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-5 py-2 text-sm font-medium text-white/90 mb-8">
          <Sparkles className="w-4 h-4" />
          Demo guiada para academias de gimnasia
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
            href="/contact?type=demo"
            className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-zaltyko-teal px-10 py-5 text-lg font-bold text-white shadow-brand transition-all duration-200 hover:bg-primary-dark hover:shadow-lift hover:-translate-y-0.5"
          >
            <Sparkles className="w-5 h-5" />
            Solicitar demo
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
          🔒 Tus datos están protegidos con encriptación de nivel bancario
        </p>
      </div>
    </section>
  );
}
