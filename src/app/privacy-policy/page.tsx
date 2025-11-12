import type { Metadata } from "next";
import Link from "next/link";

const updatedAt = "8 de noviembre de 2025";

const sections = [
  {
    title: "1. Quiénes somos",
    content: [
      "Zaltyko es una plataforma software-as-a-service operada por Mentes SaaS S.L. que ayuda a academias de gimnasia a gestionar atletas, coaches, clases y facturación en múltiples sedes.",
      "Esta política describe cómo tratamos los datos personales cuando utilizas nuestro sitio web, la aplicación web y las APIs asociadas.",
    ],
  },
  {
    title: "2. Datos que recopilamos",
    content: [
      "Datos de cuenta: nombre, apellidos, correo electrónico, contraseña (hash) y rol asignado dentro de la academia.",
      "Datos operativos: información de academias, atletas, coaches, asistencia, evaluaciones y eventos que tu organización introduce voluntariamente en la plataforma.",
      "Datos de facturación: identificadores de cliente en Stripe, historial de suscripción y metadatos de pago. No almacenamos números completos de tarjeta ni CVV.",
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
    ],
  },
  {
    title: "4. Bases legales",
    content: [
      "Ejecución de contrato cuando actúas como cliente o usuario autorizado de una academia.",
      "Interés legítimo para mejorar el servicio, prevenir fraudes y garantizar la seguridad de la plataforma.",
      "Consentimiento explícito cuando lo requerimos para comunicaciones comerciales o integraciones opcionales.",
    ],
  },
  {
    title: "5. Conservación y ubicación",
    content: [
      "Los datos se almacenan en la infraestructura de Supabase (UE) y se conservan mientras mantengas una cuenta activa o exista una obligación legal.",
      "Podemos anonimizar o agregar información para fines estadísticos una vez finalizada la relación contractual.",
    ],
  },
  {
    title: "6. Compartición de datos",
    content: [
      "Proveedores esenciales: Supabase, Stripe, Mailgun y herramientas de observabilidad necesarias para operar el servicio.",
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
      "Ejercer estos derechos escribiendo a hola@gymna.app, indicando el rol y la academia a la que perteneces.",
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
      "Para consultas sobre privacidad o ejercer tus derechos, escríbenos a hola@gymna.app o contáctanos desde la sección de soporte en el dashboard.",
    ],
  },
];

export const metadata: Metadata = {
  title: "Política de privacidad | Zaltyko",
  description:
    "Conoce cómo Zaltyko protege los datos de tus academias, atletas y coaches.",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
      >
        <span aria-hidden>←</span> Volver al inicio
      </Link>

      <header className="mt-8 space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">
          Política de privacidad
        </p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">
          Protegemos los datos que confías a Zaltyko
        </h1>
        <p className="text-sm text-slate-400">
          Última actualización: {updatedAt}
        </p>
      </header>

      <section className="mt-10 space-y-10">
        {sections.map((section) => (
          <article key={section.title} className="space-y-4">
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-slate-200/80">
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
