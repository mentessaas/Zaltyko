"use client";

import { Quote, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// TODO: Add real testimonials when available from production customers

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
            Lo que dicen nuestras academias
          </h2>
          <p className="text-xl text-gray-600">
            Descubre cómo clubes de gimnasia han simplificado su gestión con Zaltyko
          </p>
        </div>

        {/* Placeholder testimonials - Replace with real testimonials */}
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              placeholder: "Testimonios de academias reales pronto disponibles",
              author: "Próximamente",
              role: "",
              academy: ""
            },
            {
              placeholder: "Testimonios de academias reales pronto disponibles",
              author: "Próximamente",
              role: "",
              academy: ""
            },
            {
              placeholder: "Testimonios de academias reales pronto disponibles",
              author: "Próximamente",
              role: "",
              academy: ""
            },
          ].map((testimonial, i) => (
            <div
              key={i}
              className="relative bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              {/* Quote icon */}
              <div className="absolute -top-4 left-8">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <Quote className="w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Placeholder text */}
              <p className="text-gray-400 mb-6 leading-relaxed italic">
                "{testimonial.placeholder}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 font-bold">
                  ?
                </div>
                <div>
                  <p className="font-bold text-gray-400">{testimonial.author}</p>
                  {testimonial.academy && (
                    <p className="text-sm text-gray-400">{testimonial.role} · {testimonial.academy}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA: ver directorio */}
        <div className="mt-8 text-center">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 text-red-600 font-semibold hover:gap-3 transition-all text-sm"
          >
            Prueba Zaltyko gratis 14 días
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
