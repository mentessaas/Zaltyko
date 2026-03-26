import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/home/Navbar";
import Footer from "@/app/(site)/Footer";
import { BookOpen, Users, CreditCard, Calendar, MessageCircle, Mail, ChevronRight, Search } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Centro de Ayuda para Academias de Gimnasia",
  description:
    "Encuentra respuestas a tus preguntas sobre Zaltyko. Guías, tutoriales y documentación para administrar tu academia de gimnasi",
  alternates: {
    canonical: `${baseUrl}/help`,
  },
};

const categories = [
  {
    title: "Primeros pasos",
    description: "Todo lo que necesitas para empezar",
    icon: BookOpen,
    articles: [
      "Cómo crear tu cuenta",
      "Configurar tu academia",
      "Invitar a tu equipo",
      "Importar atletas",
    ],
  },
  {
    title: "Gestión de atletas",
    description: "Administra tu base de datos de atletas",
    icon: Users,
    articles: [
      "Agregar nuevos atletas",
      "Editar información de atletas",
      "Asignar a clases",
      "Gestionar familiares",
    ],
  },
  {
    title: "Clases y horarios",
    description: "Organiza tu calendario de clases",
    icon: Calendar,
    articles: [
      "Crear clases",
      "Gestionar horarios",
      "Asignar entrenadores",
      "Control de asistencia",
    ],
  },
  {
    title: "Pagos y facturación",
    description: "Gestiona cobros y suscripciones",
    icon: CreditCard,
    articles: [
      "Configurar planes de precio",
      "Procesar pagos",
      "Facturación automática",
      "Gestionar impagos",
    ],
  },
];

const faqs = [
  {
    question: "¿Cómo puedo dar de alta a un nuevo atleta?",
    answer: "Desde el panel de atletas, haz clic en 'Nuevo Atleta' y completa los datos. Puedes añadir foto, información de contacto y familiares.",
  },
  {
    question: "¿Puedo importar atletas desde Excel?",
    answer: "Sí, ve a Configuración > Importar y selecciona tu archivo Excel o CSV. El sistema mapeará automáticamente las columnas.",
  },
  {
    question: "¿Cómo funciona el control de asistencia?",
    answer: "En cada clase puedes marcar asistencia manualmente o usar el escaneo de código QR que los atletas pueden completar desde su móvil.",
  },
  {
    question: "¿Puedo enviar mensajes a los padres?",
    answer: "Sí, desde el perfil de cada atleta puedes enviar emails o configurar notificaciones automáticas para padres.",
  },
  {
    question: "¿Qué métodos de pago acepta Zaltyko?",
    answer: "Aceptamos tarjetas de crédito/débito y domiciliaciones bancarias a través de Stripe. También puedes registrar pagos manuales.",
  },
  {
    question: "¿Cómo puedo cambiar de plan?",
    answer: "Ve a Configuración > Suscripción y selecciona el nuevo plan. El cambio se aplica inmediatamente con prorrateo.",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Centro de Ayuda
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
            ¿En qué podemos ayudarte?
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            Encuentra respuestas a tus preguntas o contacta con nuestro equipo de soporte.
          </p>

          {/* Search */}
          <div className="mt-8 max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar en la ayuda..."
                className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 focus:ring-2 focus:ring-zaltyko-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main mb-8">Explorar por categoría</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {categories.map((category, index) => {
              const Icon = category.icon;
              return (
                <div key={index} className="rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zaltyko-primary/10 mb-4">
                    <Icon className="h-5 w-5 text-zaltyko-primary" />
                  </div>
                  <h3 className="font-semibold text-zaltyko-text-main">{category.title}</h3>
                  <p className="mt-1 text-sm text-zaltyko-text-secondary">{category.description}</p>
                  <ul className="mt-4 space-y-2">
                    {category.articles.slice(0, 3).map((article, i) => (
                      <li key={i}>
                        <Link href="#" className="text-sm text-zaltyko-primary hover:underline flex items-center">
                          <ChevronRight className="h-3 w-3 mr-1" />
                          {article}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main text-center mb-8">
            Preguntas frecuentes
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-zaltyko-text-main">{faq.question}</h3>
                <p className="mt-2 text-zaltyko-text-secondary">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-zaltyko-text-main">¿No encontraste lo que buscabas?</h2>
          <p className="mt-4 text-zaltyko-text-secondary">
            Nuestro equipo de soporte está disponible para ayudarte.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full bg-zaltyko-primary px-8 py-3 font-semibold text-white hover:bg-zaltyko-primary-dark"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              Contactar soporte
            </Link>
            <a
              href="mailto:soporte@zaltyko.com"
              className="inline-flex items-center rounded-full border-2 border-zaltyko-primary px-8 py-3 font-semibold text-zaltyko-primary hover:bg-zaltyko-primary/10"
            >
              <Mail className="mr-2 h-5 w-5" />
              soporte@zaltyko.com
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
