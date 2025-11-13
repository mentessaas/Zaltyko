import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zaltyko-primary-dark px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <img 
              src="/branding/zaltyko/logo-zaltyko-dark.svg" 
              alt="Zaltyko" 
              className="h-8 w-auto"
            />
            <p className="font-sans text-sm text-white/70">
              Zaltyko — El sistema definitivo para gestionar academias de gimnasia. Registra alumnos, controla pagos, organiza competencias y haz crecer tu academia sin complicaciones.
            </p>
            <p className="font-sans text-xs text-white/50">
              © {new Date().getFullYear()} Zaltyko. Construido con Next.js 14, Drizzle ORM y Supabase.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-zaltyko-accent">
              Recursos
            </h4>
            <ul className="mt-4 space-y-3 font-sans text-sm text-white/70">
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
                <a
                  href="https://github.com/mentessaas/gym-saas"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  Repositorio GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-zaltyko-accent">
              Legal & contacto
            </h4>
            <ul className="mt-4 space-y-3 font-sans text-sm text-white/70">
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
                <a href="mailto:hola@zaltyko.com" className="hover:text-white">
                  hola@zaltyko.com
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
