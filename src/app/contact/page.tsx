import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock, MessageCircle } from "lucide-react";

import {
  PublicPageClose,
  PublicPageHeader,
  PublicPageShell,
  publicContainerClass,
  tapeOutlineButtonClass,
} from "@/app/(site)/mat/PublicPage";
import { ContactForm } from "@/components/contact/ContactForm";
import Reveal from "@/components/motion/Reveal";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Contacta con el equipo de Zaltyko. Estamos disponibles para ayudarte con tu academia de gimnasia.",
  alternates: {
    canonical: `${baseUrl}/contact`,
  },
};

const contactInfo = [
  {
    icon: Mail,
    title: "Email",
    description: "Escríbenos para cualquier consulta",
    value: "hola@zaltyko.com",
    href: "mailto:hola@zaltyko.com",
  },
  {
    icon: MessageCircle,
    title: "Demo guiada",
    description: "Revisamos tu caso y te mostramos el flujo adecuado",
    value: "Solicitar demo",
    href: "/contact?type=demo",
  },
  {
    icon: Clock,
    title: "Horario",
    description: "Lunes a viernes",
    value: "9:00 - 18:00 (CET)",
  },
];

interface ContactPageProps {
  searchParams: Promise<{ type?: string; plan?: string; directoryEntryId?: string }>;
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const { type, plan, directoryEntryId } = await searchParams;
  const selectedPlan = plan ?? (type === "network" ? "network" : undefined);

  return (
    <PublicPageShell>
      <PublicPageHeader
        titleId="contact-title"
        label="Contacto"
        title="Cuéntanos sobre tu academia"
        lede="Te respondemos por email en horario laboral con una propuesta concreta para tu caso."
      />

      {/* Contact Info & Form */}
      <section className="chalk-field border-b border-chalk-line">
        <div className={cn(publicContainerClass, "py-16 lg:py-24")}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            {/* Contact Info. Solo esta columna se revela con movimiento: el
                formulario no se desplaza nunca, porque la entrada de Reveal
                (translateY de 26px durante 0,6 s al hidratar) movía las casillas
                bajo el puntero y un clic podía caer en la opción de al lado. */}
            <Reveal>
            <div>
              <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night">
                Cómo contactarnos
              </h2>
              {/* Lista reglada: regla de 3 px y filas con su cuadro de icono. */}
              <div className="mt-8 border-t-[3px] border-mat-night">
                {contactInfo.map((info, index) => {
                  const Icon = info.icon;
                  return (
                    <div key={index} className="flex items-start gap-4 border-b border-chalk-line py-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mat-wash">
                        <Icon aria-hidden className="h-5 w-5 text-mat" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-mat-night">{info.title}</h3>
                        <p className="text-sm text-ramp-600">{info.description}</p>
                        {info.href ? (
                          <a
                            href={info.href}
                            className="mt-1 inline-flex text-sm font-semibold text-mat underline decoration-2 underline-offset-4 hover:decoration-[3px]"
                          >
                            {info.value}
                          </a>
                        ) : (
                          <p className="tabular mt-1 text-sm font-semibold text-mat-night">{info.value}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-10 border-t-[3px] border-mat-night pt-5">
                <h3 className="font-display text-2xl font-black uppercase leading-none text-mat-night">Cómo trabajamos</h3>
                <p className="mt-3 text-ramp-600">
                  Leemos cada mensaje y respondemos por email en horario laboral. Si tu caso encaja con una demo, te la agendamos para ver Zaltyko aplicado a tu academia, sin guion genérico.
                </p>
              </div>
            </div>

            </Reveal>

            {/* Contact Form: sin Reveal (ver arriba). Panel reglado blanco. */}
            <div className="rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-5 sm:p-6">
              <h2 className="font-display mb-6 text-2xl font-black uppercase leading-none text-mat-night">Cuéntanos qué necesitas</h2>
              <ContactForm defaultReason={type} defaultPlan={selectedPlan} directoryEntryId={directoryEntryId} />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Link */}
      <PublicPageClose
        titleId="contact-close-title"
        title="¿Prefieres resolverlo tú mismo?"
        text="Consulta nuestro centro de ayuda con guías y tutoriales."
        actions={
          <Link href="/ayuda" className={tapeOutlineButtonClass}>
            Ver preguntas frecuentes
          </Link>
        }
      />
    </PublicPageShell>
  );
}
