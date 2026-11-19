import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { SellerIdentification } from "@/components/legal/SellerIdentification";

const baseUrl = getPublicSiteUrl();

const updatedAt = "6 de noviembre de 2026";

const sections = [
  {
    title: "1. Quiénes somos",
    content: [
      "La plataforma, operada bajo la marca Zaltyko, tiene como titular a Elvis Lazaro Valdes Inerarte, en España, identificado en esta página. Zaltyko permite gestionar familias, gimnastas, grupos, clases, inscripciones, asistencia y cuotas con registro manual de pagos. La contratación de pago permanece cerrada mientras se completan la revisión fiscal del software y los demás requisitos de apertura.",
      "El prestador de Zaltyko actúa como responsable de los datos de registro, relación con clientes, soporte y seguridad que trata para sus propios fines. La academia actúa como responsable de los datos de sus familias, gimnastas y personal; Zaltyko actúa como encargado cuando los trata siguiendo sus instrucciones, conforme al acuerdo de encargo que deberá formalizarse antes de incorporar datos reales.",
    ],
  },
  {
    title: "2. Datos que recopilamos",
    content: [
      "Datos de cuenta: nombre, apellidos, correo electrónico, contraseña (hash) y rol asignado dentro de la academia.",
      "Datos operativos: identificación y contacto de familias, tutores, gimnastas y personal; vínculos con la academia y sede; grupos, clases, inscripciones, asistencia, cuotas y pagos manuales introducidos por la academia. No introduzcas documentación de identidad, datos de salud ni otras categorías especiales que no sean necesarias y estén expresamente cubiertas por el acuerdo de encargo.",
      "Solicitudes de contacto y acceso asistido: nombre y correo de la persona de contacto, club opcional y necesidad indicada. Para un país pendiente, también el país autodeclarado, la función y las disciplinas seleccionadas. No introduzcas datos de menores ni información sensible en el texto libre. La solicitud está dirigida a representantes de clubes; no crea una academia ni una suscripción.",
      "Datos de suscripción y pago: identificadores de cliente en Stripe, historial de suscripción y metadatos de pago. No almacenamos números completos de tarjeta ni CVV.",
      "Datos técnicos: registros de acceso, direcciones IP, tipo de dispositivo, idioma, cookies esenciales y tokens de sesión para garantizar la seguridad y la experiencia de uso.",
    ],
  },
  {
    title: "3. Finalidad del tratamiento",
    content: [
      "Prestar el servicio contratado, incluyendo autenticación, control de acceso por roles y mantenimiento de tus academias.",
      "Gestionar las suscripciones SaaS mediante Stripe cuando se habilite la contratación. Las cuotas familiares se registran manualmente y no generan cargos automáticos.",
      "Mostrar resúmenes operativos a partir de los datos de la academia, respetando los permisos de acceso. No se anuncian evaluaciones automatizadas de personas ni decisiones con efectos jurídicos basadas exclusivamente en perfiles.",
      "Atender consultas y comunicar incidencias, seguridad o cambios necesarios para el servicio. Las comunicaciones comerciales requieren su base jurídica y opción de oposición o retirada; aceptar las condiciones no implica aceptar publicidad.",
      "Responder a solicitudes de acceso administrativo en países pendientes y estudiar la necesidad comunicada. La respuesta se atiende manualmente por soporte; enviar la solicitud no garantiza recibir una respuesta automática. Expresar interés o enviar esa solicitud no activa campañas ni suscribe al contacto a avisos de lanzamiento.",
    ],
  },
  {
    title: "4. Bases legales",
    content: [
      "Ejecución de contrato cuando actúas como cliente o usuario autorizado de una academia.",
      "Interés legítimo para mejorar el servicio, prevenir fraudes y garantizar la seguridad de la plataforma.",
      "Consentimiento cuando corresponda para usos opcionales, que podrá retirarse sin afectar a tratamientos anteriores lícitos. Las obligaciones legales fundamentan la conservación exigible. La academia debe determinar e informar de la base jurídica de los datos que incorpora; no se presume que todos esos tratamientos se basen en consentimiento.",
    ],
  },
  {
    title: "5. Conservación y ubicación",
    content: [
      "La base de datos productiva está alojada en Supabase en la Unión Europea. Esto no significa que todos los proveedores procesen toda la información exclusivamente en la UE. Los datos de cuenta se conservan durante la relación y después solo en la medida necesaria para obligaciones legales o reclamaciones. Los registros de seguridad se limitan a la finalidad de prevención e investigación de incidencias.",
      "Los datos operativos de la academia se conservan según sus instrucciones y el acuerdo de encargo. El archivo de una ficha no la elimina. Las solicitudes de devolución o supresión y los ciclos de copias de seguridad deberán quedar concretados en ese acuerdo antes de incorporar datos reales; no se promete un borrado automático al cancelar una suscripción.",
    ],
  },
  {
    title: "6. Compartición de datos",
    content: [
      "El inventario de proveedores comprende Vercel (alojamiento), Supabase (base de datos y autenticación), Brevo (integración de correo transaccional preparada), Hostinger Mail (buzón de soporte), Upstash/Redis (control de solicitudes), Sentry (observabilidad) y Stripe (suscripciones SaaS cuando se habiliten). El registro y la recuperación comprobados utilizan Supabase Auth; todavía no se acredita una entrega transaccional de Brevo desde el núcleo. La participación y los datos tratados por cada proveedor deberán concretarse en el inventario y el acuerdo de encargo antes de incorporar datos reales.",
      "Cumplimiento legal: podemos divulgar información si una autoridad competente lo solicita conforme a la legislación aplicable.",
      "No vendemos datos personales ni los compartimos con fines publicitarios de terceros. Cuando un proveedor implique transferencias fuera del Espacio Económico Europeo, deberán documentarse el destino y la garantía aplicable antes de ese tratamiento; no se presume adecuación por el mero uso del proveedor.",
    ],
  },
  {
    title: "7. Derechos de los usuarios",
    content: [
      "Acceder, rectificar o borrar tus datos personales.",
      "Limitar u oponerte a determinados tratamientos.",
      "Solicitar la portabilidad de la información en un formato estructurado.",
      "La descarga canónica disponible es un paquete parcial de datos operativos, con alcance y exclusiones expresos. Sus hashes comprueban la integridad del contenido del paquete; no demuestran su procedencia ni una devolución integral, y no existe un servicio de restauración acreditado mediante esa descarga. Las fuentes excluidas deben tramitarse por el procedimiento de derechos correspondiente.",
      "Para datos de tu cuenta o relación con Zaltyko, escribe a hola@zaltyko.com. Para datos que una academia haya incorporado sobre ti, dirige la solicitud a esa academia; Zaltyko le prestará la asistencia que corresponda como encargado. Podrá pedirse la información mínima necesaria para verificar tu identidad. Puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).",
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
      "El registro público está dirigido a personas que representan academias, no a menores. La academia es responsable de informar a familias y representantes y de contar con la base jurídica que corresponda para los datos de menores que introduzca. Zaltyko no presume que una aceptación del administrador sustituya esos requisitos.",
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
      "Para consultas sobre privacidad o ejercer tus derechos, escríbenos a hola@zaltyko.com, el contacto oficial del titular. Los datos de identificación del titular se muestran en esta página.",
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

          <SellerIdentification />

          <section className="mt-10 space-y-10">
            {sections.map((section) => (
              <article key={section.title} className="space-y-4">
                <h2 className="text-xl font-semibold text-zaltyko-text-main">{section.title}</h2>
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
