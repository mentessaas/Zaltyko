import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

const updatedAt = "8 de noviembre de 2025";

const sections = [
  {
    title: "1. Objeto",
    paragraphs: [
      "Las presentes Condiciones regulan el acceso y uso de Zaltyko, plataforma SaaS que permite a academias de gimnasia gestionar atletas, staff, clases, eventos y facturación.",
      "Al registrarte, acceder o utilizar el servicio confirmas que tienes autoridad para hacerlo en nombre de una organización y aceptas estos términos.",
    ],
  },
  {
    title: "2. Registro y cuenta",
    paragraphs: [
      "El usuario administrador es responsable de la veracidad de los datos proporcionados, así como de configurar los roles (owner, coach, staff, súper admin) dentro de cada academia.",
      "Debes custodiar tus credenciales y notificar de inmediato cualquier acceso no autorizado a hola@zaltyko.com. Podemos suspender o cancelar cuentas que infrinjan estos términos.",
    ],
  },
  {
    title: "3. Planes, pagos y facturación",
    paragraphs: [
      "Ofrecemos planes Free, Pro y Premium descritos en https://zaltyko.com/pricing. Los pagos recurrentes se procesan a través de Stripe u otro proveedor autorizado.",
      "Puedes cancelar o cambiar de plan en cualquier momento desde el portal de facturación. Si solicitas la baja, el plan continuará activo hasta el final del periodo en curso.",
      "Para compras realizadas a través de Stripe, aplicamos un periodo de reembolso de 7 días en caso de insatisfacción, siempre que no se haya utilizado de forma abusiva el servicio.",
    ],
  },
  {
    title: "4. Uso aceptable",
    paragraphs: [
      "Queda prohibido subir contenido ilegal, difamatorio o que infrinja derechos de terceros. También se prohíbe el uso del servicio para spam, scraping o cualquier actividad que comprometa la seguridad.",
      "Mentes SaaS se reserva el derecho de auditar logs de auditoría para detectar uso indebido y tomar medidas correctivas.",
    ],
  },
  {
    title: "5. Propiedad intelectual",
    paragraphs: [
      "Zaltyko y sus componentes son propiedad de Mentes SaaS S.L. El uso del servicio no concede derechos de propiedad intelectual sobre el software, salvo las licencias limitadas contempladas en estos términos.",
      "La información cargada por tu academia seguirá siendo tuya. Tienes derecho a exportarla mientras la cuenta esté activa o durante los 30 días posteriores a la cancelación.",
    ],
  },
  {
    title: "6. Datos personales y confidencialidad",
    paragraphs: [
      "El tratamiento de datos personales se describe en nuestra Política de Privacidad. Nos comprometemos a mantener la confidencialidad de la información de tu academia.",
      "Puedes firmar un Acuerdo de Encargado de Tratamiento (DPA) solicitándolo a hola@zaltyko.com para dar cumplimiento a la normativa europea aplicable.",
    ],
  },
  {
    title: "7. Integraciones de terceros",
    paragraphs: [
      "El acceso a integraciones opcionales (Stripe, Mailgun, GymnasticMeet, etc.) está sujeto a los términos de cada proveedor. No somos responsables de su disponibilidad ni de incidencias derivadas de su uso.",
    ],
  },
  {
    title: "8. Garantías y responsabilidad",
    paragraphs: [
      "Zaltyko se ofrece \"tal cual\". Aunque trabajamos para garantizar alta disponibilidad, no garantizamos ausencia de interrupciones. No responderemos por daños indirectos, lucro cesante o pérdida de datos ocasionados por terceros.",
      "Nuestra responsabilidad total frente a tu organización estará limitada al importe abonado en los últimos doce (12) meses previos al incidente que origine la reclamación.",
    ],
  },
  {
    title: "9. Terminación",
    paragraphs: [
      "Puedes dejar de usar el servicio en cualquier momento. También podremos suspender o cancelar tu acceso si incumples estos términos o si lo exige una autoridad competente.",
      "Salvo obligación legal, eliminaremos los datos de tu cuenta 30 días después de la terminación definitiva.",
    ],
  },
  {
    title: "10. Cambios en los términos",
    paragraphs: [
      "Podemos actualizar estas condiciones para reflejar cambios normativos o mejoras del servicio. Te lo notificaremos con antelación razonable mediante correo electrónico a los administradores registrados.",
    ],
  },
  {
    title: "11. Legislación aplicable y jurisdicción",
    paragraphs: [
      "Estos términos se rigen por la legislación española. Cualquier controversia se someterá a los tribunales de Madrid, salvo que una normativa imperativa establezca otra jurisdicción.",
    ],
  },
  {
    title: "12. Contacto",
    paragraphs: [
      "Si tienes preguntas sobre estos términos, contáctanos en hola@zaltyko.com.",
    ],
  },
];

export const metadata: Metadata = {
  title: "Términos y condiciones | Zaltyko",
  description: "Condiciones de uso de la plataforma Zaltyko para academias de gimnasia.",
};

export default function TermsOfServicePage() {
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
              Términos y condiciones
            </p>
            <h1 className="text-3xl font-bold text-zaltyko-text-main sm:text-4xl">
              Condiciones de uso de Zaltyko
            </h1>
            <p className="text-sm text-zaltyko-text-secondary">
              Última actualización: {updatedAt}
            </p>
          </header>

          <section className="mt-10 space-y-10">
            {sections.map((section) => (
              <article key={section.title} className="space-y-4">
                <h2 className="text-xl font-semibold text-zaltyko-text-main">{section.title}</h2>
                <div className="space-y-3 text-sm leading-relaxed text-zaltyko-text-secondary">
                  {section.paragraphs.map((paragraph) => (
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
