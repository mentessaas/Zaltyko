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
    <section className="border-b border-white/10 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Descripción */}
          {academy.publicDescription && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-white">
                Sobre la academia
              </h2>
              <div className="prose prose-invert max-w-none">
                <p className="text-white/80 leading-relaxed whitespace-pre-line">
                  {academy.publicDescription}
                </p>
              </div>
            </div>
          )}

          {/* Información de contacto */}
          {(hasContactInfo || hasSocialMedia) && (
            <div>
              <h2 className="mb-6 font-display text-2xl font-semibold text-white">
                Información de contacto
              </h2>
              <div className="space-y-4">
                {academy.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-zaltyko-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Sitio web</p>
                      <a
                        href={academy.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zaltyko-accent-light hover:text-zaltyko-accent transition-colors break-all"
                      >
                        {academy.website}
                      </a>
                    </div>
                  </div>
                )}

                {academy.contactEmail && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-zaltyko-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Email</p>
                      <a
                        href={`mailto:${academy.contactEmail}`}
                        className="text-zaltyko-accent-light hover:text-zaltyko-accent transition-colors"
                      >
                        {academy.contactEmail}
                      </a>
                    </div>
                  </div>
                )}

                {academy.contactPhone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-zaltyko-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Teléfono</p>
                      <a
                        href={`tel:${academy.contactPhone}`}
                        className="text-zaltyko-accent-light hover:text-zaltyko-accent transition-colors"
                      >
                        {academy.contactPhone}
                      </a>
                    </div>
                  </div>
                )}

                {academy.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-zaltyko-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Dirección</p>
                      <p className="text-white/80">{academy.address}</p>
                    </div>
                  </div>
                )}

                {hasSocialMedia && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-3">Redes sociales</p>
                    <div className="flex flex-wrap gap-3">
                      {academy.socialInstagram && (
                        <a
                          href={academy.socialInstagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 hover:border-white/20"
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
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 hover:border-white/20"
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
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 hover:border-white/20"
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
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 hover:border-white/20"
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

