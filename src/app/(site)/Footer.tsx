import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  producto: [
    { label: "Producto", href: "/features" },
    { label: "Precios", href: "/pricing" },
    { label: "Integraciones", href: "/integrations" },
    { label: "Documentación", href: "/docs" },
  ],
  recursos: [
    { label: "Directorio de Academias", href: "/academias" },
    { label: "Eventos", href: "/events" },
    { label: "Centro de Ayuda", href: "/help" },
    { label: "Solicitar demo", href: "/contact?type=demo" },
  ],
  empresa: [
    { label: "Sobre nosotros", href: "/about" },
    { label: "Contacto", href: "/contact" },
    { label: "Trabaja con nosotros", href: "mailto:hola@zaltyko.com" },
  ],
  legal: [
    { label: "Términos del servicio", href: "/tos" },
    { label: "Política de privacidad", href: "/privacy-policy" },
    { label: "Cookies", href: "/privacy-policy#cookies" },
  ],
};

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-zaltyko-navy text-white">
      <div className="absolute inset-0 zaltyko-motion-lines opacity-50" />
      <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-zaltyko-indigo/20 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-zaltyko-teal/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-white/10 py-8">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {[
              { label: "RGPD Compliant", desc: "Datos protegidos" },
              { label: "SSL Encriptado", desc: "Conexión segura" },
              { label: "Cancelación libre", desc: "Sin permanencia" },
              { label: "Soporte en español", desc: "Respuesta 24h" },
            ].map((badge) => (
              <div key={badge.label} className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <span className="text-xs font-bold text-white/80">✓</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{badge.label}</p>
                  <p className="text-xs text-white/40">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 py-16 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="group flex items-center gap-2">
              <Image
                src="/branding/zaltyko/logo-zaltyko-dark.svg"
                alt="Zaltyko"
                width={200}
                height={60}
                className="transition-transform duration-150 group-hover:scale-[1.02]"
                style={{ width: 142, height: "auto" }}
              />
            </Link>
            <p className="mt-5 max-w-xs text-sm font-medium leading-relaxed text-white/70">
              El sistema de dirección para academias de gimnasia artística y rítmica.
              Gestiona gimnastas, grupos, cobros y familias desde un solo panel.
            </p>

            <div className="mt-6 flex gap-3">
              {[
                { label: "Twitter", href: "https://twitter.com/zaltyko", initial: "T" },
                { label: "LinkedIn", href: "https://linkedin.com/company/zaltyko", initial: "L" },
                { label: "Instagram", href: "https://instagram.com/zaltyko", initial: "I" },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 transition-all duration-300 hover:scale-110 hover:bg-gradient-to-br hover:from-zaltyko-primary hover:to-zaltyko-primary-dark hover:shadow-lg hover:shadow-zaltyko-primary/30"
                  aria-label={social.label}
                >
                  <span className="text-xs font-bold uppercase">{social.initial}</span>
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h4 className="mb-5 text-sm font-bold uppercase tracking-wider text-white/90">
                {section}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm font-medium text-white/60 transition-all duration-200 hover:translate-x-1 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 sm:flex-row">
          <p className="text-sm font-medium text-white/50">
            © {new Date().getFullYear()} Zaltyko. Todos los derechos reservados.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <span className="text-xs font-medium text-white/40">
              Software para academias de gimnasia
            </span>
            <span className="hidden text-xs text-white/40 sm:inline">•</span>
            <span className="text-xs font-medium text-white/40">
              Artística femenina, masculina y rítmica
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
