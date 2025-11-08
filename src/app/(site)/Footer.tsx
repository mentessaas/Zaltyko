import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#050b0d] px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">GymnaSaaS</h3>
            <p className="text-sm text-slate-300/70">
              SaaS multi-tenant para academias de gimnasia: dashboards, Stripe, flujos de onboarding y RLS listos para producción.
            </p>
            <p className="text-xs text-slate-400/70">
              © {new Date().getFullYear()} GymnaSaaS. Construido con Next.js 14, Drizzle ORM y Supabase.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
              Recursos
            </h4>
            <ul className="mt-4 space-y-3 text-sm text-slate-200/70">
              <li>
                <Link href="#caracteristicas" className="hover:text-white">
                  Características
                </Link>
              </li>
              <li>
                <Link href="#planes" className="hover:text-white">
                  Planes y precios
                </Link>
              </li>
              <li>
                <Link href="/onboarding" className="hover:text-white">
                  Onboarding guiado
                </Link>
              </li>
              <li>
                <Link href="/docs" className="hover:text-white">
                  Documentación técnica
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
              Legal & contacto
            </h4>
            <ul className="mt-4 space-y-3 text-sm text-slate-200/70">
              <li>
                <Link href="/tos" className="hover:text-white">
                  Términos del servicio
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-white">
                  Política de privacidad
                </Link>
              </li>
              <li>
                <a href="mailto:hola@gymna.app" className="hover:text-white">
                  hola@gymna.app
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
