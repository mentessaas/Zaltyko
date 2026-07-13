"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "¿Para qué modalidades sirve Zaltyko?",
    answer: "Zaltyko está enfocado en gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. Si tu academia trabaja artística y rítmica, puedes configurarla como mixta.",
  },
  {
    question: "¿Cuánto tiempo tarda en configurarse?",
    answer: "La puesta en marcha es guiada y se adapta al volumen de datos y al equipo. Empezamos por academia, gimnastas, grupos, horarios y cobros sin prometer una duración cerrada antes de revisar el caso.",
  },
  {
    question: "¿Sirve si ahora trabajo con Excel o WhatsApp?",
    answer: "Sí. Zaltyko está pensado para pasar de hojas dispersas y mensajes sueltos a un sistema ordenado para dirección, entrenadores y familias.",
  },
  {
    question: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
    answer: "Zaltyko permite importar gimnastas desde Excel o CSV. Para otros datos o migraciones amplias, revisamos el formato y planteamos una puesta en marcha guiada.",
  },
  {
    question: "¿Qué plan necesito para mi academia?",
    answer: "Depende del tamaño, número de grupos, sedes y necesidades de cobro. Por eso priorizamos una demo corta antes de recomendar Starter, Growth o Network.",
  },
  {
    question: "¿Puedo cancelar en cualquier momento?",
    answer: "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, volverás automáticamente al plan gratuito.",
  },
  {
    question: "¿Qué pasa con mis datos si cancelo?",
    answer: "El acceso y la conservación se gestionan según el estado de la cuenta, el módulo y la política de privacidad vigente. Antes de cancelar, revisa las exportaciones disponibles o solicita ayuda al equipo.",
  },
  {
    question: "¿Funciona en móvil?",
    answer: "Sí. Zaltyko es una aplicación web responsive y el flujo de clase del coach está verificado en móvil. Puede marcar asistencia desde el navegador.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-zaltyko-white0 via-zaltyko-indigo to-zaltyko-teal" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
            Preguntas Frecuentes
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Resolvemos tus dudas
          </h2>
          <p className="text-xl text-gray-600">
            Todo lo que necesitas saber antes de empezar
          </p>
        </div>

        {/* FAQ accordion */}
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className={cn(
                "rounded-2xl border transition-all duration-200",
                openIndex === i
                  ? "border-zaltyko-teal/30 bg-zaltyko-teal/5 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
                aria-expanded={openIndex === i}
              >
                <span className={cn(
                  "font-semibold text-base pr-4 transition-colors",
                  openIndex === i ? "text-zaltyko-indigo" : "text-gray-900"
                )}>
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-gray-600 shrink-0 transition-transform duration-200",
                    openIndex === i && "rotate-180 text-zaltyko-coral"
                  )}
                />
              </button>

              {openIndex === i && (
                <div className="px-6 pb-5">
                  <p className="text-gray-600 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Ver pricing */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 mb-3 text-sm">¿Listo para empezar?</p>
          <Link
            href="/pricing#planes"
            className="inline-flex items-center gap-2 bg-zaltyko-teal hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Ver planes y precios
          </Link>
        </div>

        {/* Still have questions */}
        <div className="mt-12 text-center bg-gray-50 rounded-2xl p-8 border border-gray-100">
          <p className="text-gray-600 mb-3">¿Aún tienes preguntas?</p>
          <a
            href="mailto:hola@zaltyko.com"
            className="text-zaltyko-teal font-semibold hover:text-zaltyko-indigo transition-colors"
          >
            Escríbenos a hola@zaltyko.com
          </a>
          <p className="text-sm text-gray-600 mt-2">
            Atención por email en días laborables
          </p>
        </div>
      </div>
    </section>
  );
}
