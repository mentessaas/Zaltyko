import Link from "next/link";

const footerLinks = {
  producto: [
    { label: "Características", href: "#modulos" },
    { label: "Precios", href: "/pricing" },
    { label: "Integraciones", href: "#integraciones" },
    { label: "Actualizaciones", href: "#" },
  ],
  recursos: [
    { label: "Directorio de Academias", href: "/academias" },
    { label: "Centro de Ayuda", href: "#" },
    { label: "Guía de inicio", href: "#" },
    { label: "Blog", href: "#" },
  ],
  empresa: [
    { label: "Sobre nosotros", href: "#" },
    { label: "Contacto", href: "mailto:hola@zaltyko.com" },
    { label: "Trabaja con nosotros", href: "#" },
  ],
  legal: [
    { label: "Términos del servicio", href: "/tos" },
    { label: "Política de privacidad", href: "/privacy-policy" },
    { label: "Cookies", href: "#" },
  ],
};

export default function FooterSection() {
  return (
    <footer className="bg-gradient-to-b from-zaltyko-text-main to-slate-900 text-white relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-zaltyko-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Main footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark text-white font-bold text-xl shadow-lg shadow-zaltyko-primary/30 group-hover:scale-110 transition-transform">
                Z
              </div>
              <span className="font-display text-2xl font-bold text-white tracking-tight">
                Zaltyko
              </span>
            </Link>
            <p className="mt-5 text-sm text-white/70 leading-relaxed max-w-xs font-medium">
              El software definitivo para academias de gimnasiia artistica, ritmica y acrobatica.
              Gestiona atletas, clases, pagos y eventos desde un solo panel.
            </p>

            {/* Social links */}
            <div className="mt-6 flex gap-3">
              {["twitter", "linkedin", "instagram"].map((social) => (
                <a
                  key={social}
                  href={`https://${social}.com/zaltyko`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-gradient-to-br hover:from-zaltyko-primary hover:to-zaltyko-primary-dark transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-zaltyko-primary/30"
                  aria-label={social}
                >
                  <span className="text-xs uppercase font-bold">{social[0]}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white/90 mb-5">
              Producto
            </h4>
            <ul className="space-y-3">
              {footerLinks.producto.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white hover:translate-x-1 transition-all duration-200 font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white/90 mb-5">
              Recursos
            </h4>
            <ul className="space-y-3">
              {footerLinks.recursos.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white hover:translate-x-1 transition-all duration-200 font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white/90 mb-5">
              Empresa
            </h4>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white hover:translate-x-1 transition-all duration-200 font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white/90 mb-5">
              Legal
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white hover:translate-x-1 transition-all duration-200 font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/50 font-medium">
            © {new Date().getFullYear()} Zaltyko. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-xs text-white/40 font-medium">
              Software para academias de gimnasiia
            </span>
            <span className="text-xs text-white/40">•</span>
            <span className="text-xs text-white/40 font-medium">
              Gestion de clubes deportivos
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
