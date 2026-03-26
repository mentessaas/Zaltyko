"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "¿Puedo probarlo sin dar datos de pago?",
    answer:
      "Sí. Puedes crear tu cuenta gratis y usar Zaltyko hasta 50 atletas sin introducir ningún dato de pago. El trial de 14 días te da acceso completo al plan Pro para que pruebes todo sin compromiso.",
  },
  {
    question: "¿Cuánto tiempo tarda en configurarse?",
    answer:
      "La mayoría de academias están operativas en menos de 2 horas. Importas tus atletas (desde Excel o manualmente), configuras tus clases y horarios, y listo. Nuestro equipo de soporte te ayuda en el proceso si lo necesitas.",
  },
  {
    question: "¿Mis datos están aislados de otras academias?",
    answer:
      "Sí. Cada academia tiene sus datos completamente aislados. Usamos Row Level Security (RLS) a nivel de base de datos, lo que garantiza que solo tú puedas ver la información de tu academia. Cumplimos con el RGPD.",
  },
  {
    question: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
    answer:
      "Sí. Zaltyko permite importar atletas, grupos y datos históricos desde archivos Excel o CSV. Si tienes un archivo con tus atletas, en minutos los tendrás todos dentro de la plataforma.",
  },
  {
    question: "¿Qué pasa si tengo más de 50 atletas?",
    answer:
      "El plan Free cubre hasta 50 atletas. Cuando llegues al límite, te recomendamos el plan Pro (19€/mes) que soporta hasta 200 atletas. Puedes hacer el upgrade desde el panel de tu cuenta en cualquier momento.",
  },
  {
    question: "¿Puedo cancelar en cualquier momento?",
    answer:
      "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, volverás automáticamente al plan gratuito.",
  },
  {
    question: "¿Qué pasa con mis datos si cancelo?",
    answer:
      "Tus datos se mantienen disponibles durante 30 días después de cancelar. Puedes exportar toda tu información en cualquier momento. Pasados los 30 días, se eliminan de nuestros servidores según nuestra política de retención.",
  },
  {
    question: "¿Funciona en móvil para los coaches?",
    answer:
      "Sí. Zaltyko es una aplicación web responsive que funciona perfectamente en móvil, tablet y escritorio. Los coaches pueden marcar asistencia desde su teléfono al llegar a clase sin instalar nada.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="px-4 py-16 md:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-center font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Preguntas frecuentes
        </h2>
        <p className="mb-10 text-center font-sans text-sm text-muted-foreground">
          ¿Necesitas algo más? Escríbenos a <a className="underline text-zaltyko-primary" href="mailto:hola@zaltyko.com">hola@zaltyko.com</a> y te ayudamos a poner tu academia en línea.
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
                  className="flex w-full min-h-[44px] items-center justify-between bg-card border border-border px-6 py-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="font-sans text-[15px] font-semibold text-foreground">
                    {faq.question}
                  </span>
                  <span className="ml-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border">
                    <PlusIcon
                      className={`h-3 w-3 text-foreground transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
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
                    <div className="bg-muted/50 px-6 py-4 font-sans text-base text-muted-foreground">
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
