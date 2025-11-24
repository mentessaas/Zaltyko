import { Globe, Mail, Phone, MapPin, Instagram, Facebook, Twitter, Youtube } from "lucide-react";
import type { PublicAcademyDetail } from "@/app/actions/public/get-public-academy";

interface AcademyInfoProps {
  academy: PublicAcademyDetail;
}

export function AcademyInfo({ academy }: AcademyInfoProps) {
  const hasContactInfo = academy.website || academy.contactEmail || academy.contactPhone || academy.address;
  const hasSocialMedia = academy.socialInstagram || academy.socialFacebook || academy.socialTwitter || academy.socialYoutube;
  const hasAnyInfo = academy.publicDescription || hasContactInfo || hasSocialMedia;

  if (!hasAnyInfo) {
    return null;
  }

  return (
    <section className="border-b border-border py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Descripción */}
          {academy.publicDescription && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
                Sobre la academia
              </h2>
              <div className="prose max-w-none">
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {academy.publicDescription}
                </p>
              </div>
            </div>
          )}

          {/* Información de contacto */}
          {(hasContactInfo || hasSocialMedia) && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-foreground">
                Información de contacto
              </h2>
              <div className="space-y-4">
                {academy.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sitio web</p>
                      <a
                        href={academy.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors break-all"
                      >
                        {academy.website}
                      </a>
                    </div>
                  </div>
                )}

                {academy.contactEmail && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                      <a
                        href={`mailto:${academy.contactEmail}`}
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
                      >
                        {academy.contactEmail}
                      </a>
                    </div>
                  </div>
                )}

                {academy.contactPhone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teléfono</p>
                      <a
                        href={`tel:${academy.contactPhone}`}
                        className="text-zaltyko-primary hover:text-zaltyko-primary-dark transition-colors"
                      >
                        {academy.contactPhone}
                      </a>
                    </div>
                  </div>
                )}

                {academy.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-zaltyko-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dirección</p>
                      <p className="text-foreground">{academy.address}</p>
                    </div>
                  </div>
                )}

                {hasSocialMedia && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Redes sociales</p>
                    <div className="flex flex-wrap gap-3">
                      {academy.socialInstagram && (
                        <a
                          href={academy.socialInstagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted hover:border-zaltyko-primary/50"
                        >
                          <Instagram className="h-4 w-4" />
                          Instagram
                        </a>
                      )}
                      {academy.socialFacebook && (
                        <a
                          href={academy.socialFacebook}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted hover:border-zaltyko-primary/50"
                        >
                          <Facebook className="h-4 w-4" />
                          Facebook
                        </a>
                      )}
                      {academy.socialTwitter && (
                        <a
                          href={academy.socialTwitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted hover:border-zaltyko-primary/50"
                        >
                          <Twitter className="h-4 w-4" />
                          Twitter
                        </a>
                      )}
                      {academy.socialYoutube && (
                        <a
                          href={academy.socialYoutube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted hover:border-zaltyko-primary/50"
                        >
                          <Youtube className="h-4 w-4" />
                          YouTube
                        </a>
                      )}
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

