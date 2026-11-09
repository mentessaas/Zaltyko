"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { isPublicNavigationActive } from "@/lib/navigation/active";
import { cn } from "@/lib/utils";

const links = [
  { href: "/features", label: "Producto" },
  { href: "/pricing", label: "Precios" },
  { href: "/ayuda", label: "Ayuda" },
];

/**
 * Barra pública «Magnesio sobre tapiz»: la zona de seguridad azul oscuro
 * que rodea el tapiz. El enlace activo lleva debajo un tramo de cinta blanca.
 */
export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isMenuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav
        aria-label="Navegación principal"
        className={cn(
          "mat-field-deep border-b border-white/10 transition-shadow duration-200",
          scrolled && "shadow-[0_10px_24px_-18px_rgba(11,20,48,0.9)]"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Zaltyko, inicio"
            className="rounded-sm text-white focus-visible:ring-white focus-visible:ring-offset-mat-deep"
          >
            <ZaltykoLockup markClassName="h-7 w-7" />
          </Link>

          <ul className="hidden items-stretch gap-1 lg:flex">
            {links.map((link) => {
              const active = isPublicNavigationActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-16 items-center px-3 text-sm font-semibold transition-colors focus-visible:ring-white focus-visible:ring-offset-mat-deep",
                      active ? "text-white" : "text-white/75 hover:text-white"
                    )}
                  >
                    {link.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-3 bottom-0 h-[3px] bg-white transition-transform duration-200 ease-out",
                        active ? "scale-x-100" : "scale-x-0"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/auth/login"
              className="hidden min-h-11 items-center rounded-md px-3 text-sm font-semibold text-white/85 transition-colors hover:text-white focus-visible:ring-white focus-visible:ring-offset-mat-deep sm:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register?role=owner"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md bg-white px-4 text-sm font-bold text-mat-deep transition-colors hover:bg-chalk focus-visible:ring-white focus-visible:ring-offset-mat-deep"
            >
              <span className="sm:hidden">Crear cuenta</span>
              <span className="hidden sm:inline">Crear cuenta gratis</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-mat-deep lg:hidden"
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={isMenuOpen}
              aria-controls="public-mobile-menu"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-40 bg-mat-night/40 lg:hidden"
              aria-hidden="true"
              onClick={() => setIsMenuOpen(false)}
            />
            <div
              id="public-mobile-menu"
              className="mat-field-deep absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 px-4 pb-6 pt-2 lg:hidden"
            >
              <ul>
                {links.map((link) => {
                  const active = isPublicNavigationActive(pathname, link.href);
                  return (
                    <li key={link.href} className="border-b border-white/10">
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setIsMenuOpen(false)}
                        className={cn(
                          "font-display flex min-h-14 items-center text-2xl font-bold uppercase tracking-[0.02em]",
                          active ? "text-white" : "text-white/80"
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 grid gap-3">
                <Link
                  href="/auth/register?role=owner"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-white text-base font-bold text-mat-deep"
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href="/auth/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/40 text-base font-semibold text-white"
                >
                  Iniciar sesión
                </Link>
              </div>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
