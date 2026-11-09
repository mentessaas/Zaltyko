import Link from "next/link";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";

const footerLinks: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Producto",
    links: [
      { label: "Producto", href: "/features" },
      { label: "Precios", href: "/pricing" },
      { label: "Crear academia", href: "/auth/register?role=owner" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { label: "Contacto", href: "/contact" },
      { label: "Iniciar sesión", href: "/auth/login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Identificación del titular", href: "/terminos#titular" },
      { label: "Términos del servicio", href: "/terminos" },
      { label: "Política de privacidad", href: "/politica-privacidad" },
      { label: "Cookies", href: "/politica-privacidad#cookies" },
    ],
  },
];

const PROMISES = ["Datos aislados por academia", "Conexión cifrada", "Sin permanencia", "Soporte en español por email"];

export default function Footer() {
  return (
    <footer className="bg-mat-night text-white">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-14">
        <div className="grid gap-12 border-b border-white/10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <div>
            <Link href="/" aria-label="Zaltyko, inicio" className="inline-flex rounded-sm text-white">
              <ZaltykoLockup markClassName="h-8 w-8" />
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/75">
              El sistema de dirección para academias de gimnasia artística y rítmica: gimnastas, grupos,
              cobros y familias en un solo sitio.
            </p>
          </div>

          <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {footerLinks.map((section) => (
              <div key={section.title} className="min-w-0">
                <h2 className="floor-label border-b-[3px] border-white pb-2 text-white">{section.title}</h2>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-white/75 transition-colors hover:text-white hover:underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 py-8 text-sm text-white/70 lg:flex-row lg:items-center lg:justify-between">
          <p>© {new Date().getFullYear()} Zaltyko. Software para academias de gimnasia artística y rítmica.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
