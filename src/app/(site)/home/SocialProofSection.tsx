"use client";

import { cn } from "@/lib/utils";

const stats = [
  { value: "150+", label: "Academias activas", sublabel: "en España y LATAM" },
  { value: "25,000+", label: "Atletas gestionados", sublabel: "a nivel nacional" },
  { value: "€4.2M", label: "Procesado en pagos", sublabel: "últimos 12 meses" },
  { value: "98%", label: "Satisfacción", sublabel: "de nuestros clientes" },
];

export default function SocialProofSection() {
  return (
    <section className="py-16 bg-white border-y border-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div 
              key={i}
              className="text-center group"
            >
              <div className="inline-flex flex-col items-center">
                <span className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
                  {stat.value}
                </span>
                <span className="text-sm font-semibold text-gray-900 mt-2">{stat.label}</span>
                <span className="text-xs text-gray-500">{stat.sublabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
