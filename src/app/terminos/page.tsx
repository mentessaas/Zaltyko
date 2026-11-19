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
    title: "1. Objeto",
    paragraphs: [
      "Estas condiciones describen Zaltyko, plataforma SaaS para gestionar familias, gimnastas, grupos, clases, inscripciones, asistencia y cuotas con registro manual de pagos. Los pagos familiares no se cobran automáticamente.",
      "La creación de una academia requiere que una persona con autoridad para representarla acepte expresamente estas condiciones. La lectura de la política de privacidad informa sobre el tratamiento de datos; no sustituye los consentimientos específicos que correspondan.",
      "La disponibilidad administrativa, los contenidos deportivos y la contratación de Zaltyko se habilitan por separado. El acceso administrativo en España y México comprende las capacidades explicadas durante el alta. Un perfil deportivo general no acredita adaptación a una federación. Para otros países puede solicitarse acceso asistido, sin crear una academia con un país ficticio ni comprometer una fecha de apertura.",
    ],
  },
  {
    title: "2. Registro y cuenta",
    paragraphs: [
      "La persona propietaria de la academia es responsable de la veracidad de los datos y de asignar al personal únicamente los accesos necesarios para su función y sede. No debe compartir sus credenciales.",
      "Debes custodiar tus credenciales y notificar de inmediato cualquier acceso no autorizado a hola@zaltyko.com. Podemos suspender o cancelar cuentas que infrinjan estos términos.",
    ],
  },
  {
    title: "3. Planes, pagos y suscripción",
    paragraphs: [
      "El catálogo incluye Free, Starter y Growth. Starter tiene un precio base de 19 €/mes o 190 €/año; Growth, de 49 €/mes o 490 €/año. Estos precios no incluyen IVA. El impuesto aplicable y el importe final deberán mostrarse antes de confirmar la contratación. Network requiere contratación acompañada.",
      "La suscripción SaaS de la academia es independiente de las cuotas de sus familias, cuyos pagos se registran manualmente. Free admite 30 gimnastas activos, 3 grupos y 10 clases. Al perder capacidad de un plan o trial, si se superan esos límites, se conservan los datos y la operativa queda en solo lectura hasta archivar el excedente o, cuando la contratación esté habilitada, contratar capacidad suficiente. Archivar el excedente seguirá disponible. Las pruebas de contratación en sandbox no son compras reales.",
      "Cuando la contratación esté habilitada, podrás consultar el plan y las facturas y gestionar la cancelación mediante el Portal de suscripción disponible desde la aplicación. La cancelación de renovación conserva el acceso pagado hasta el final del periodo. Los cambios de plan se ofrecerán únicamente por los canales y opciones habilitados, mostrando sus condiciones antes de confirmar.",
      "La moneda de las cuotas del club es independiente de la suscripción a Zaltyko. Los recorridos administrativos iniciales utilizan EUR en España y MXN en México como monedas por defecto, conservando la moneda de cada obligación. No se convierte dinero automáticamente ni se presenta un registro de pago manual como factura fiscal local. El acceso administrativo en México no habilita por sí mismo la contratación internacional de la suscripción.",
    ],
  },
  {
    title: "4. Uso aceptable",
    paragraphs: [
      "Queda prohibido subir contenido ilegal, difamatorio o que infrinja derechos de terceros. También se prohíbe el uso del servicio para spam, scraping o cualquier actividad que comprometa la seguridad.",
      "Los registros técnicos y de auditoría se utilizan para investigar incidencias, proteger el servicio y detectar usos indebidos, con acceso limitado al personal autorizado.",
    ],
  },
  {
    title: "5. Propiedad intelectual",
    paragraphs: [
      "El software y la marca están protegidos por los derechos de sus respectivos titulares. Se concede a la academia un derecho de uso no exclusivo durante la vigencia de su acceso. Los componentes de terceros conservan sus licencias.",
      "La información cargada por tu academia seguirá siendo tuya. Puedes ejercer los derechos sobre los datos personales conforme a la Política de Privacidad.",
    ],
  },
  {
    title: "6. Datos personales y confidencialidad",
    paragraphs: [
      "El tratamiento de datos personales se describe en nuestra Política de Privacidad. Nos comprometemos a mantener la confidencialidad de la información de tu academia.",
      "Respecto de los datos que introduce la academia sobre familias, gimnastas y personal, la academia determina los fines del tratamiento y Zaltyko los trata por su cuenta. Antes de incorporar datos personales reales deberá formalizarse el acuerdo de encargo de tratamiento aplicable; estas condiciones no lo sustituyen. Contacto para su tramitación: hola@zaltyko.com.",
    ],
  },
  {
    title: "7. Integraciones de terceros",
    paragraphs: [
      "La prestación utiliza proveedores de alojamiento, autenticación, base de datos, correo, seguridad y pagos. Su participación se describe en la política de privacidad y, cuando corresponda, en el acuerdo de encargo. El uso de proveedores no excluye las obligaciones que legalmente correspondan al prestador de Zaltyko.",
    ],
  },
  {
    title: "8. Garantías y responsabilidad",
    paragraphs: [
      "El servicio puede sufrir interrupciones o requerir mantenimiento. No se garantiza disponibilidad ininterrumpida ni resultados económicos o deportivos. Las incidencias se comunicarán y atenderán mediante el canal de soporte, sin que se prometa un plazo de respuesta no acordado.",
      "La responsabilidad se determinará conforme a la legislación aplicable y a las circunstancias del caso. Estas condiciones no excluyen responsabilidades ni derechos que no puedan limitarse legalmente.",
    ],
  },
  {
    title: "9. Terminación",
    paragraphs: [
      "Puedes dejar de usar el servicio en cualquier momento. También podremos suspender o cancelar tu acceso si incumples estos términos o si lo exige una autoridad competente.",
      "Cancelar una renovación no equivale a borrar la cuenta ni los datos. La conservación, devolución y supresión se tramitan conforme a la política de privacidad, el acuerdo de encargo y las obligaciones legales aplicables. Archivar una ficha conserva su historial.",
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
      "Estos términos se rigen por la legislación española, respetando las normas imperativas y la jurisdicción que corresponda legalmente.",
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
  title: "Términos y condiciones",
  description: "Condiciones de uso de la plataforma Zaltyko para academias de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/terminos`,
  },
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

          <SellerIdentification />

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
