"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "¿Puedo probarlo sin dar datos de pago?",
    answer: "Sí. Puedes crear tu cuenta gratis y usar Zaltyko hasta 50 atletas sin introducir ningún dato de pago. El trial de 14 días te da acceso completo al plan Pro para que pruebes todo.",
  },
  {
    question: "¿Cuánto tiempo tarda en configurarse?",
    answer: "La mayoría de academias están operativas en menos de 2 horas. Importas tus atletas (desde Excel o manualmente), configuras tus clases y horarios, y listo. Nuestro equipo de soporte te ayuda en el proceso si lo necesitas.",
  },
  {
    question: "¿Mis datos están aislados de otras academias?",
    answer: "Sí. Cada academia tiene sus datos completamente aislados. Usamos Row Level Security (RLS) a nivel de base de datos, lo que garantiza que solo tú puedas ver la información de tu academia. Cumplimos con el RGPD.",
  },
  {
    question: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
    answer: "Sí. Zaltyko permite importar atletas, grupos y datos históricos desde archivos Excel o CSV. Si tienes un archivo con tus atletas, en minutos los tendrás todos dentro de la plataforma.",
  },
  {
    question: "¿Qué pasa si tengo más de 50 atletas?",
    answer: "El plan Free cubre hasta 50 atletas. Cuando llegues al límite, te recomendamos el plan Pro (19€/mes) que soporta hasta 200 atletas. Puedes hacer el upgrade desde el panel de tu cuenta en cualquier momento.",
  },
  {
    question: "¿Puedo cancelar en cualquier momento?",
    answer: "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, volverás automáticamente al plan gratuito.",
  },
  {
    question: "¿Qué pasa con mis datos si cancelo?",
    answer: "Tus datos se mantienen disponibles durante 30 días después de cancelar. Puedes exportar toda tu información en cualquier momento. Pasados los 30 días, se eliminan de nuestros servidores según nuestra política de retención.",
  },
  {
    question: "¿Funciona en móvil?",
    answer: "Sí. Zaltyko es una aplicación web responsive que funciona perfectamente en móvil, tablet y escritorio. Los coaches pueden marcar asistencia desde su teléfono al llegar a clase.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-rose-500 to-red-600" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
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
                  ? "border-red-200 bg-red-50/50 shadow-sm"
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
                  openIndex === i ? "text-red-700" : "text-gray-900"
                )}>
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200",
                    openIndex === i && "rotate-180 text-red-500"
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
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Ver planes y precios
          </Link>
        </div>

        {/* Still have questions */}
        <div className="mt-12 text-center bg-gray-50 rounded-2xl p-8 border border-gray-100">
          <p className="text-gray-600 mb-3">¿Aún tienes preguntas?</p>
          <a
            href="mailto:hola@zaltyko.com"
            className="text-red-600 font-semibold hover:text-red-700 transition-colors"
          >
            Escríbenos a hola@zaltyko.com
          </a>
          <p className="text-sm text-gray-400 mt-2">
            Respondemos en menos de 24h en días laborables
          </p>
        </div>
      </div>
    </section>
  );
}
