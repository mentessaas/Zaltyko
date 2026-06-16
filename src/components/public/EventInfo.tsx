import { Globe, Mail, Phone, MapPin, Instagram, Calendar, FileText, Download } from "lucide-react";
import type { PublicEvent } from "@/types/events";

interface EventInfoProps {
  event: PublicEvent & { academy?: { id: string; name: string; logoUrl: string | null; country: string | null; region: string | null; city: string | null; website: string | null; contactEmail: string | null; contactPhone: string | null; socialInstagram: string | null } | null };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Fecha por confirmar";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function EventInfo({ event }: EventInfoProps) {
  const hasContactInfo = event.contactEmail || event.contactPhone || event.contactWebsite || event.contactInstagram;
  const hasDescription = event.description;
  const hasCategory = event.category && event.category.length > 0;
  const hasRegistrationDates = event.registrationStartDate || event.registrationEndDate;
  const hasAttachments = event.attachments && Array.isArray(event.attachments) && event.attachments.length > 0;
  const location = [
    event.cityName || event.city,
    event.provinceName || event.province,
    event.countryName || event.country,
  ].filter(Boolean).join(", ");

  if (!hasDescription && !hasContactInfo && !hasCategory && !hasRegistrationDates && !hasAttachments) {
    return null;
  }

  return (
    <section className="border-b border-border py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Descripción y categorías */}
          {(hasDescription || hasCategory) && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
                Sobre el evento
              </h2>
              {hasDescription && (
                <div className="prose max-w-none mb-4">
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {event.description}
                  </p>
                </div>
              )}
              {hasCategory && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {event.category?.map((cat, idx) => (
                    <span
                      key={idx}
                      className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {hasRegistrationDates && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Fechas de inscripción</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {event.registrationStartDate && formatDate(event.registrationStartDate)}
                      {event.registrationStartDate && event.registrationEndDate && " - "}
                      {event.registrationEndDate && formatDate(event.registrationEndDate)}
                    </span>
                  </div>
                </div>
              )}

              {hasAttachments && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Archivos adjuntos</h3>
                  <div className="space-y-2">
                    {event.attachments?.map((attachment, idx) => (
                      <a
                        key={idx}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm text-foreground transition hover:bg-muted hover:border-zaltyko-primary/50"
                      >
                        <FileText className="h-4 w-4 text-zaltyko-primary shrink-0" />
                        <span className="flex-1">{attachment.name || `Archivo ${idx + 1}`}</span>
                        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Información de contacto */}
          {hasContactInfo && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
                Información de contacto
              </h2>
              <div className="space-y-4">
                {event.contactEmail && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                      <a
                        href={`mailto:${event.contactEmail}`}
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
                      >
                        {event.contactEmail}
                      </a>
                    </div>
                  </div>
                )}

                {event.contactPhone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teléfono</p>
                      <a
                        href={`tel:${event.contactPhone}`}
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
                      >
                        {event.contactPhone}
                      </a>
                    </div>
                  </div>
                )}

                {event.contactWebsite && (
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sitio web</p>
                      <a
                        href={event.contactWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors break-all"
                      >
                        {event.contactWebsite}
                      </a>
                    </div>
                  </div>
                )}

                {event.contactInstagram && (
                  <div className="flex items-start gap-3">
                    <Instagram className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram</p>
                      <a
                        href={event.contactInstagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
                      >
                        {event.contactInstagram}
                      </a>
                    </div>
                  </div>
                )}

                {location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ubicación</p>
                      <p className="text-foreground">{location}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

