import Link from "next/link";
import { Globe, MapPin, ArrowRight } from "lucide-react";

// Clusters principales por país - España y México prioritarios
const PRIORITY_CLUSTERS = [
  // España
  { locale: "es", modality: "gimnasia-artistica", country: "espana", label: "Gimnasia Artística", countryLabel: "España", flag: "🇪🇸" },
  { locale: "es", modality: "gimnasia-ritmica", country: "espana", label: "Gimnasia Rítmica", countryLabel: "España", flag: "🇪🇸" },
  { locale: "es", modality: "gimnasia-acrobatica", country: "espana", label: "Gimnasia Acrobática", countryLabel: "España", flag: "🇪🇸" },
  { locale: "es", modality: "trampolin", country: "espana", label: "Trampolín", countryLabel: "España", flag: "🇪🇸" },
  // México
  { locale: "es", modality: "gimnasia-artistica", country: "mexico", label: "Gimnasia Artística", countryLabel: "México", flag: "🇲🇽" },
  { locale: "es", modality: "gimnasia-ritmica", country: "mexico", label: "Gimnasia Rítmica", countryLabel: "México", flag: "🇲🇽" },
  // Argentina
  { locale: "es", modality: "gimnasia-artistica", country: "argentina", label: "Gimnasia Artística", countryLabel: "Argentina", flag: "🇦🇷" },
  { locale: "es", modality: "gimnasia-ritmica", country: "argentina", label: "Gimnasia Rítmica", countryLabel: "Argentina", flag: "🇦🇷" },
];

const ALL_MODALITIES = [
  { slug: "gimnasia-artistica", label: "Gimnasia Artística", icon: "🤸" },
  { slug: "gimnasia-ritmica", label: "Gimnasia Rítmica", icon: "🎀" },
  { slug: "gimnasia-acrobatica", label: "Gimnasia Acrobática", icon: "✨" },
  { slug: "trampolin", label: "Trampolín", icon: "🏃" },
];

const ALL_COUNTRIES = [
  { slug: "espana", label: "España", flag: "🇪🇸" },
  { slug: "mexico", label: "México", flag: "🇲🇽" },
  { slug: "argentina", label: "Argentina", flag: "🇦🇷" },
  { slug: "colombia", label: "Colombia", flag: "🇨🇴" },
  { slug: "chile", label: "Chile", flag: "🇨🇱" },
  { slug: "peru", label: "Perú", flag: "🇵🇪" },
];

export default function ClusterDiscoverySection() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Encuentra tu solución
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Especialistas en tu país y modalidad
          </h2>
          <p className="text-xl text-gray-600">
            Contenido específico para federaciones, categorías y competiciones locales.
            Selecciona tu modalidad y país para ver información adaptada.
          </p>
        </div>

        {/* Quick access - Priority clusters */}
        <div className="mb-16">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            Acceso rápido a clusters prioritarios
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PRIORITY_CLUSTERS.map((cluster) => (
              <Link
                key={`${cluster.locale}-${cluster.modality}-${cluster.country}`}
                href={`/${cluster.locale}/${cluster.modality}/${cluster.country}`}
                className="group flex flex-col items-center p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-red-100 transition-all duration-300 hover:-translate-y-1"
              >
                <span className="text-4xl mb-3">{cluster.flag}</span>
                <span className="text-sm font-medium text-gray-500 mb-1">{cluster.countryLabel}</span>
                <span className="text-base font-semibold text-gray-900 group-hover:text-red-600 transition-colors text-center">
                  {cluster.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Full matrix - Modalities x Countries */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            Explora todas las combinaciones
          </h3>

          {/* Modality tabs would go here - for now, show full grid */}
          <div className="bg-gray-50 rounded-2xl p-6">
            {/* Countries row */}
            <div className="flex flex-wrap gap-3 mb-6 justify-center">
              {ALL_COUNTRIES.map((country) => (
                <Link
                  key={country.slug}
                  href={`/es/gimnasia-artistica/${country.slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-all"
                >
                  <span>{country.flag}</span>
                  <span>{country.label}</span>
                </Link>
              ))}
            </div>

            {/* Modalities grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {ALL_MODALITIES.map((modality) => (
                <div
                  key={modality.slug}
                  className="bg-white rounded-xl p-5 border border-gray-100"
                >
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span>{modality.icon}</span>
                    {modality.label}
                  </h4>
                  <div className="space-y-2">
                    {ALL_COUNTRIES.slice(0, 4).map((country) => (
                      <Link
                        key={`${modality.slug}-${country.slug}`}
                        href={`/es/${modality.slug}/${country.slug}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          {country.label}
                        </span>
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                    {ALL_COUNTRIES.length > 4 && (
                      <Link
                        href={`/es/${modality.slug}`}
                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                      >
                        Ver más países
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/es/gimnasia-artistica/espana"
            className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
          >
            <Globe className="h-5 w-5" />
            Explorar clusters SEO
          </Link>
          <p className="text-sm text-gray-500 mt-3">
            52 páginas específicas por país y modalidad
          </p>
        </div>
      </div>
    </section>
  );
}
