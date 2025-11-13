"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "¿Necesito integrar mis llaves reales para probar?",
    answer:
      "No. Activa el modo demo desde el onboarding y generamos perfiles, academia y datos ficticios para que explores el dashboard sin configurar NextAuth ni Stripe.",
  },
  {
    question: "¿Cómo se maneja el multi-tenant?",
    answer:
      "Cada academia se crea con un tenant_id único. Las políticas RLS de Supabase y nuestro middleware withTenant garantizan aislamiento total. El Súper Admin puede cambiar de tenant sin salir de la sesión.",
  },
  {
    question: "¿Puedo migrar mis atletas desde Excel?",
    answer:
      "Sí. Ofrecemos scripts de importación a través de la API y, en el roadmap, un cargador CSV desde el dashboard. Mientras tanto, puedes usar las rutas de `/api/athletes`.",
  },
  {
    question: "¿Stripe es obligatorio?",
    answer:
      "Stripe gestiona los upgrades entre Free, Pro y Premium. Si prefieres facturar manualmente, mantente en Free y configura los límites mediante nuestros helpers.",
  },
  {
    question: "¿Qué pasa si supero el límite de atletas?",
    answer:
      "Los endpoints de creación validan los límites con `assertWithinPlanLimits`. Si alcanzas el tope, devolvemos un error 402 con CTA para actualizar de plan. No perderás datos existentes.",
  },
  {
    question: "¿Puedo personalizar roles y permisos?",
    answer:
      "Actualmente incluimos owner, coach, staff y súper admin. Puedes extender el enum en `src/db/schema/enums.ts` y los checks en `authz.ts`.",
  },
  {
    question: "¿Cómo se integra GymnasticMeet?",
    answer:
      "En la fase II exponemos endpoints para sincronizar inscripciones y resultados. Ya estamos modelando el esquema para no romper compatibilidad.",
  },
  {
    question: "¿Hay soporte o acompañamiento?",
    answer:
      "Para el plan Premium ofrecemos onboarding asistido y soporte prioritario. Escríbenos a ventas@zaltyko.com y coordinamos una sesión.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="bg-zaltyko-primary-dark px-4 py-16 md:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-center font-display text-3xl font-semibold text-white sm:text-4xl">
          Preguntas frecuentes
        </h2>
        <p className="mb-10 text-center font-sans text-sm text-white/70">
          ¿Necesitas algo más? Escríbenos a <a className="underline" href="mailto:hola@zaltyko.com">hola@zaltyko.com</a> y te ayudamos a poner tu academia en línea.
        </p>

        <div className="space-y-[2px]">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="overflow-hidden">
                <button
                  onClick={() => toggleQuestion(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${index}`}
                  className="flex w-full min-h-[44px] items-center justify-between bg-zaltyko-primary-dark/50 px-6 py-4 text-left transition-colors hover:bg-zaltyko-primary-dark"
                >
                  <span className="font-sans text-[15px] font-semibold text-white">
                    {faq.question}
                  </span>
                  <span className="ml-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20">
                    <PlusIcon
                      className={`h-3 w-3 text-white transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
                    />
                  </span>
                </button>
                <div
                  id={`faq-answer-${index}`}
                  className={`grid transition-all duration-200 ease-in-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="bg-zaltyko-primary-dark/30 px-6 py-4 font-sans text-base text-white/60">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlusIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}
