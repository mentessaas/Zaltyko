"use client";

import Link from "next/link";
import { BarChart3, Menu, X, ArrowRight } from "lucide-react";
import { useState } from "react";
import { isDevFeaturesEnabled } from "@/lib/dev";

const links = [
  { href: "/academias", label: "Directorio de Academias" },
  { href: "#caracteristicas", label: "Características" },
  { href: "#modulos", label: "Módulos" },
  { href: "#planes", label: "Planes" },
  { href: "#faq", label: "FAQs" },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <img 
            src="/branding/zaltyko/logo-zaltyko-dark.svg" 
            alt="Zaltyko" 
            className="h-8 w-auto"
          />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/auth/login"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-zaltyko-primary hover:bg-muted"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/onboarding"
            className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-5 py-2.5 text-sm font-bold text-zaltyko-primary-dark shadow-md shadow-zaltyko-accent/20 transition-all duration-300 hover:scale-105 hover:from-zaltyko-accent-light hover:to-zaltyko-accent hover:shadow-lg hover:shadow-zaltyko-accent/30 active:scale-100"
          >
            <span>Empezar ahora</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-foreground transition-colors hover:bg-muted md:hidden"
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMenuOpen && (
        <div id="mobile-menu" role="menu" className="border-t border-border bg-background md:hidden">
          <div className="space-y-1 px-4 py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/auth/login"
              className="block rounded-md px-3 py-2 text-base font-semibold text-foreground hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/onboarding"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-4 py-3 text-center text-sm font-bold text-zaltyko-primary-dark shadow-md shadow-zaltyko-accent/20 transition-all duration-300 hover:scale-105 hover:from-zaltyko-accent-light hover:to-zaltyko-accent hover:shadow-lg hover:shadow-zaltyko-accent/30 active:scale-100"
              onClick={() => setIsMenuOpen(false)}
            >
              <span>Empezar ahora</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
