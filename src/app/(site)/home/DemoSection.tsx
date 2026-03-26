"use client";

import { Play, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const demoPoints = [
  "Dashboard en tiempo real con todas tus clases",
  "Registro de asistencia en 1 click",
  "Gestión de cobros automáticos con Stripe",
  "Comunicación con padres sin WhatsApp",
];

export default function DemoSection() {
  return (
    <section id="demo" className="py-24 bg-gray-50 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 w-[600px] h-[600px] bg-red-100 rounded-full blur-3xl opacity-40 -translate-x-1/2" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Demo
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Mira cómo funciona Zaltyko
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            En menos de 2 minutos veras cómo gestionar atletas, clases y cobros desde un solo panel.
          </p>
        </div>

        {/* Video Container */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-gray-200 bg-black aspect-video max-w-3xl mx-auto">
          {/* Placeholder thumbnail con overlay de play */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center">
            {/* Fake dashboard UI preview */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-4 left-4 right-4 h-8 bg-white/10 rounded-lg" />
              <div className="absolute top-16 left-4 w-48 h-32 bg-white/5 rounded-xl" />
              <div className="absolute top-16 right-4 w-64 h-48 bg-white/5 rounded-xl" />
              <div className="absolute bottom-4 left-4 right-4 h-6 bg-white/5 rounded-lg" />
            </div>

            {/* Play button */}
            <button
              className="relative z-10 w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-2xl shadow-red-600/50 transition-all duration-300 hover:scale-110 group"
              aria-label="Reproducir demo"
            >
              <Play className="w-8 h-8 text-white ml-1 group-hover:scale-110 transition-transform" fill="white" />
            </button>

            <p className="relative z-10 mt-4 text-white/60 text-sm">
              Haz clic para ver el demo (90 segundos)
            </p>
          </div>

          {/* Borde decorativo */}
          <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none" />
        </div>

        {/* Key points */}
        <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {demoPoints.map((point) => (
            <div key={point} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">{point}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <p className="text-gray-500 mb-4">¿Prefieres verlo tú mismo?</p>
          <Link
            href="/onboarding"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all duration-300 text-base"
            )}
          >
            Probar gratis 14 días
          </Link>
        </div>
      </div>
    </section>
  );
}
