"use client";

import { Quote, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    quote: "Zaltyko nos permitió unificar 3 sedes en un solo panel. La asistencia diaria se volvió automática y los reportes para padres son impecables. Ahorramos al menos 10 horas semanales en tareas administrativas.",
    author: "Carolina Torres",
    role: "Directora",
    academy: "Gravity Gym Barcelona",
    initials: "CT",
    rating: 5,
  },
  {
    quote: "Migramos 180 atletas sin fricción. Cuando llegamos al límite del plan, el sistema nos guió al upgrade de forma transparente. La gestión de pagos y morosidad mejoró drásticamente.",
    author: "Julián Andrade",
    role: "Director Financiero",
    academy: "Escuela Olímpica Medellín",
    initials: "JA",
    rating: 5,
  },
  {
    quote: "Organizamos la gira regional sin usar WhatsApp. Coaches y padres recibieron todas las notificaciones desde la plataforma. La coordinación de competiciones es ahora un proceso simple.",
    author: "María Fernanda Luna",
    role: "Head Coach",
    academy: "Zenith Elite Madrid",
    initials: "ML",
    rating: 5,
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-red-50 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Testimonios
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Academias que transformaron su gestión
          </h2>
          <p className="text-xl text-gray-600">
            Descubre cómo otros clubes de gimnasia han simplificado sus operaciones con Zaltyko
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, i) => (
            <div 
              key={i}
              className="relative bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              {/* Quote icon */}
              <div className="absolute -top-4 left-8">
                <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                  <Quote className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, j) => (
                  <svg key={j} className="w-5 h-5 text-amber-400 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-600 mb-6 leading-relaxed italic">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center text-white font-bold">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-500">{testimonial.role} · {testimonial.academy}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA: ver directorio */}
        <div className="mt-8 text-center">
          <Link
            href="/academias"
            className="inline-flex items-center gap-2 text-red-600 font-semibold hover:gap-3 transition-all text-sm"
          >
            Ver directorio de academias
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "10h", label: "ahorradas/semana" },
            { value: "0", label: "hojas de Excel" },
            { value: "100%", label: "comunicación controlada" },
            { value: "3x", label: "más eficiencia" },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-4xl font-bold text-red-600">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
