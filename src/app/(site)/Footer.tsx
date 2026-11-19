import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  producto: [
    { label: "Producto", href: "/features" },
    { label: "Precios", href: "/pricing" },
    { label: "Comparativas", href: "/comparativas" },
    { label: "Integraciones", href: "/integraciones" },
    { label: "Documentación", href: "/docs" },
  ],
  recursos: [
    { label: "Blog", href: "/blog" },
    { label: "Directorio de Academias", href: "/academias" },
    { label: "Eventos", href: "/events" },
    { label: "Centro de Ayuda", href: "/ayuda" },
    { label: "Crear cuenta gratis", href: "/auth/register?role=owner" },
  ],
  // Clusteres principales para SEO local (es + en). Anchor text descriptivo
  // refuerza autoridad topical en SERPs por país/modalidad.
  descubre: [
    { label: "Gimnasia artística en España", href: "/es/gimnasia-artistica/espana" },
    { label: "Gimnasia rítmica en España", href: "/es/gimnasia-ritmica/espana" },
    { label: "Gimnasia artística en México", href: "/es/gimnasia-artistica/mexico" },
    { label: "Gimnasia artística en Argentina", href: "/es/gimnasia-artistica/argentina" },
    { label: "Gimnasia rítmica en Colombia", href: "/es/gimnasia-ritmica/colombia" },
  ],
  empresa: [
    { label: "Sobre nosotros", href: "/sobre-nosotros" },
    { label: "Contacto", href: "/contact" },
    { label: "Trabaja con nosotros", href: "/empleo" },
  ],
  legal: [
    { label: "Términos del servicio", href: "/terminos" },
    { label: "Política de privacidad", href: "/politica-privacidad" },
    { label: "Cookies", href: "/politica-privacidad#cookies" },
  ],
};

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-zaltyko-navy text-white">
      <div className="absolute inset-0 zaltyko-motion-lines opacity-50" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-white/10 py-8">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {[
              { label: "Privacidad por diseño", desc: "Controles de acceso" },
              { label: "SSL Encriptado", desc: "Conexión segura" },
              { label: "Cancelación libre", desc: "Sin permanencia" },
              { label: "Soporte en español", desc: "Atención por email" },
            ].map((badge) => (
              <div key={badge.label} className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <span className="text-xs font-bold text-white/80">✓</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{badge.label}</p>
                  <p className="text-xs text-white/60">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Estructura adaptada de @uiception/footer-section-v2 (hallado con
            ui-indexador): marca a un lado y una rejilla de cinco columnas
            (2 → 3 → 5) para que ninguna sección quede huérfana en otra fila. */}
        <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <div>
            <Link href="/" className="group inline-flex items-center gap-2">
              <Image
                src="/branding/zaltyko/logo-zaltyko-dark.svg"
                alt="Zaltyko"
                width={200}
                height={60}
                className="transition-transform duration-150 group-hover:scale-[1.02] motion-reduce:transition-none"
                style={{ width: 142, height: "auto" }}
              />
            </Link>
            <p className="mt-5 max-w-xs text-sm font-medium leading-relaxed text-white/70">
              El sistema de dirección para academias de gimnasia artística y rítmica.
              Gestiona gimnastas, grupos, cobros y familias desde un solo panel.
            </p>
          </div>

          <nav
            aria-label="Pie de página"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-5"
          >
            {Object.entries(footerLinks).map(([section, links]) => (
              <div key={section} className="min-w-0 space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-white/90">
                  {section}
                </h2>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 sm:flex-row">
          <p className="text-sm font-medium text-white/60">
            © {new Date().getFullYear()} Zaltyko. Todos los derechos reservados.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <span className="text-xs font-medium text-white/60">
              Software para academias de gimnasia
            </span>
            <span aria-hidden className="hidden text-xs text-white/60 sm:inline">•</span>
            <span className="text-xs font-medium text-white/60">
              Artística femenina, masculina y rítmica
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
