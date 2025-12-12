import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border px-4 py-12 md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <img src="/branding/zaltyko/logo-zaltyko-dark.svg" 
              alt="Zaltyko" 
              className="h-8 w-auto"
              />
            <p className="font-sans text-sm text-muted-foreground">
              Zaltyko — El sistema definitivo para academias de gimnasia. Registra alumnos, controla pagos, organiza clases y crece sin caos.
            </p>
            <p className="font-sans text-xs text-muted-foreground">
              © {new Date().getFullYear()} Zaltyko. Construido con Next.js 14, Drizzle ORM y Supabase.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-zaltyko-accent">
              Recursos
            </h4>
            <ul className="mt-4 space-y-3 font-sans text-sm text-muted-foreground">
              <li>
                <Link href="/academias" className="hover:text-foreground">
                  Directorio de Academias
                </Link>
              </li>
              <li>
                <Link href="#caracteristicas" className="hover:text-foreground">
                  Características
                </Link>
              </li>
              <li>
                <Link href="#planes" className="hover:text-foreground">
                  Planes y precios
                </Link>
              </li>
              <li>
                <Link href="/onboarding" className="hover:text-foreground">
                  Onboarding guiado
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/mentessaas/gym-saas"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground"
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
            <ul className="mt-4 space-y-3 font-sans text-sm text-muted-foreground">
              <li>
                <Link href="/tos" className="hover:text-foreground">
                  Términos del servicio
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="hover:text-foreground">
                  Política de privacidad
                </Link>
              </li>
              <li>
                <a href="mailto:hola@zaltyko.com" className="hover:text-foreground">
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
