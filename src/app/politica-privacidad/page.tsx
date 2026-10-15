import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

const updatedAt = "15 de octubre de 2026";

const sections = [
  {
    title: "1. Quiénes somos",
    content: [
      "El responsable del tratamiento es Elvis Valdes Inerarte, persona física que opera bajo la marca Zaltyko. Domicilio de contacto: Calle Río Amazonas 5, 29660 Marbella, Málaga, España. Correo de privacidad y contacto: hola@zaltyko.com.",
      "Zaltyko es una plataforma software-as-a-service que ayuda a academias de gimnasia a gestionar gimnastas, personal, clases y cobros internos.",
      "Esta política describe cómo tratamos los datos personales cuando utilizas nuestro sitio web, la aplicación web y las APIs asociadas.",
    ],
  },
  {
    title: "2. Datos que recopilamos",
    content: [
      "Datos de cuenta: nombre, apellidos, correo electrónico, contraseña (hash) y rol asignado dentro de la academia.",
      "Solicitudes de contacto: nombre, correo electrónico, motivo, mensaje y, si lo facilitas, nombre de la academia. La información de país y modalidad deportiva se solicita después, al configurar una academia; no es necesaria para enviar una consulta.",
      "Datos operativos: información de academias, atletas, coaches, asistencia, evaluaciones y eventos que tu organización introduce voluntariamente en la plataforma.",
      "Datos de suscripción y pago: identificadores de cliente en Stripe, historial de suscripción y metadatos de pago. No almacenamos números completos de tarjeta ni CVV.",
      "Datos técnicos: registros de acceso, direcciones IP, tipo de dispositivo, idioma, cookies esenciales y tokens de sesión para garantizar la seguridad y la experiencia de uso.",
    ],
  },
  {
    title: "3. Finalidad del tratamiento",
    content: [
      "Prestar el servicio contratado, incluyendo autenticación, control de acceso por roles y mantenimiento de tus academias.",
      "Procesar pagos y upgrades de plan mediante Stripe u otros procesadores compatibles.",
      "Generar analíticas agregadas para ayudarte a monitorear desempeño y uso de la plataforma.",
      "Comunicarnos contigo sobre novedades del producto, soporte y cambios relevantes en los servicios.",
      "Responder a las solicitudes de información, migración o acompañamiento comercial y gestionar los pasos previos que nos pidas. El formulario de contacto no te suscribe a comunicaciones comerciales.",
    ],
  },
  {
    title: "4. Bases legales",
    content: [
      "Ejecución de contrato cuando actúas como cliente o usuario autorizado de una academia.",
      "Para responder a solicitudes comerciales o de información: medidas precontractuales solicitadas por ti cuando correspondan; para otras consultas, interés legítimo en atender y gestionar la comunicación, ponderado con tus derechos.",
      "Interés legítimo para mejorar el servicio, prevenir fraudes y garantizar la seguridad de la plataforma.",
      "Consentimiento explícito cuando lo requerimos para comunicaciones comerciales o integraciones opcionales.",
    ],
  },
  {
    title: "5. Conservación y ubicación",
    content: [
      "Los datos se almacenan en la infraestructura de Supabase (UE) y se conservan mientras mantengas una cuenta activa o exista una obligación legal.",
      "Si una solicitud comercial no da lugar a una relación contractual, conservaremos sus datos identificativos y el contenido de la consulta durante un máximo de 12 meses desde el último contacto significativo. Si continúa una evaluación, prueba o negociación, el plazo empieza al cerrar ese proceso. Después los eliminaremos o anonimizaremos, salvo los datos que debamos conservar para cumplir una obligación legal o formular, ejercer o defender reclamaciones.",
      "Podemos anonimizar o agregar información para fines estadísticos una vez finalizada la relación contractual.",
    ],
  },
  {
    title: "6. Compartición de datos",
    content: [
      "Proveedores esenciales: Supabase, Stripe, Brevo y herramientas de observabilidad necesarias para operar el servicio.",
      "Cumplimiento legal: podemos divulgar información si una autoridad competente lo solicita conforme a la legislación aplicable.",
      "No vendemos datos personales ni los compartimos con fines publicitarios de terceros.",
    ],
  },
  {
    title: "7. Derechos de los usuarios",
    content: [
      "Acceder, rectificar o borrar tus datos personales.",
      "Limitar u oponerte a determinados tratamientos.",
      "Solicitar la portabilidad de la información en un formato estructurado.",
      "Ejercer estos derechos escribiendo a hola@zaltyko.com. También puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).",
    ],
  },
  {
    title: "8. Seguridad",
    content: [
      "Aplicamos políticas RLS en Supabase, cifrado TLS, almacenamiento seguro de contraseñas y auditoría de accesos.",
      "Recomendamos habilitar autenticación multifactor cuando esté disponible y limitar los accesos compartidos.",
    ],
  },
  {
    title: "9. Menores de edad",
    content: [
      "Zaltyko está pensada para administradores y personal autorizado de academias. No recopilamos datos directamente de menores sin consentimiento de su representante legal.",
    ],
  },
  {
    title: "10. Cambios en la política",
    content: [
      "Podremos actualizar esta política para reflejar mejoras o requisitos legales. Notificaremos a los administradores por correo electrónico y publicaremos la fecha de la última revisión.",
    ],
  },
  {
    title: "11. Contacto",
    content: [
      "Para consultas sobre privacidad o ejercer tus derechos, contacta con Elvis Valdes Inerarte, responsable del tratamiento, en hola@zaltyko.com o en Calle Río Amazonas 5, 29660 Marbella, Málaga, España. Si ya tienes cuenta, también puedes contactar desde la sección de soporte del dashboard.",
    ],
  },
];

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Conoce cómo Zaltyko protege los datos de tus academias, atletas y coaches.",
  alternates: {
    canonical: `${baseUrl}/politica-privacidad`,
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-32 pb-16">
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
          >
            <span aria-hidden>←</span> Volver al inicio
          </Link>

          <header className="mt-8 space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-zaltyko-primary font-semibold">
              Política de privacidad
            </p>
            <h1 className="text-3xl font-bold text-zaltyko-text-main sm:text-4xl">
              Protegemos los datos que confías a Zaltyko
            </h1>
            <p className="text-sm text-zaltyko-text-secondary">
              Última actualización: {updatedAt}
            </p>
          </header>

          <section className="mt-10 space-y-10">
            {sections.map((section) => (
              <article key={section.title} className="space-y-4">
                <h2 className="text-xl font-semibold text-zaltyko-text-main">
                  {section.title}
                </h2>
                <div className="space-y-3 text-sm leading-relaxed text-zaltyko-text-secondary">
                  {section.content.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
