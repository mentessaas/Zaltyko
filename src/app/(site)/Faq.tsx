"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "¿Para qué modalidades sirve Zaltyko?",
    answer:
      "Zaltyko está enfocado en gimnasia artística femenina, gimnasia artística masculina y gimnasia rítmica. Las academias mixtas pueden trabajar artística y rítmica desde una misma cuenta.",
  },
  {
    question: "¿Cuánto tiempo tarda en configurarse?",
    answer:
      "La puesta en marcha es guiada y se adapta al volumen de datos y al equipo. Empezamos por academia, gimnastas, grupos, horarios y cobros, sin prometer una duración cerrada antes de revisar el caso.",
  },
  {
    question: "¿Mis datos están aislados de otras academias?",
    answer:
      "Zaltyko aplica aislamiento por academia, controles de acceso y permisos por rol. RLS protege el acceso directo a la base de datos y las APIs validan el contexto de academia y tenant.",
  },
  {
    question: "¿Puedo migrar mis datos desde Excel o Google Sheets?",
    answer:
      "Puedes importar gimnastas desde Excel o CSV. Para otros datos o migraciones amplias, revisamos el formato y definimos una puesta en marcha guiada.",
  },
  {
    question: "¿Qué plan necesito para mi academia?",
    answer:
      "Depende del tamaño, número de grupos, sedes y necesidades de cobro. Por eso recomendamos una demo antes de elegir Starter, Growth o Network.",
  },
  {
    question: "¿Puedo cancelar en cualquier momento?",
    answer:
      "Sí. No hay permanencia ni penalizaciones. Cancela cuando quieras desde tu panel de cuenta. Si cancelas el plan de pago, volverás automáticamente al plan gratuito.",
  },
  {
    question: "¿Qué pasa con mis datos si cancelo?",
    answer:
      "El acceso y la conservación se gestionan según el estado de la cuenta, el módulo y la política de privacidad vigente. Antes de cancelar, revisa las exportaciones disponibles o solicita ayuda al equipo.",
  },
  {
    question: "¿Funciona en móvil para los coaches?",
    answer:
      "Sí. Zaltyko es una aplicación web responsive y el flujo de clase del coach está verificado en móvil. Puede pasar asistencia y registrar progreso desde el navegador, sin instalar una app nativa.",
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
