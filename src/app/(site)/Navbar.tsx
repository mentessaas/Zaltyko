"use client";

import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/academias", label: "Academias" },
  { href: "#caracteristicas", label: "Características" },
  { href: "#planes", label: "Precios" },
  { href: "#faq", label: "Ayuda" },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "bg-white/95 backdrop-blur-md border-b border-zaltyko-border/50 shadow-soft py-2"
          : "bg-white/80 backdrop-blur-sm border-b border-transparent py-4"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark text-white font-bold text-xl shadow-lg transition-transform group-hover:scale-105">
            Z
          </div>
          <span className="font-display text-xl font-bold text-zaltyko-text-main tracking-tight">
            Zaltyko
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zaltyko-text-secondary transition-colors hover:text-zaltyko-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/auth/login"
            className="text-sm font-semibold text-zaltyko-text-main hover:text-zaltyko-primary transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/onboarding"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full px-6")}
          >
            Empezar ahora
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-zaltyko-text-main hover:bg-zaltyko-bg md:hidden"
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute top-full left-0 w-full glass-panel border-t border-white/20 md:hidden animate-in slide-in-from-top-5">
          <div className="space-y-2 px-4 py-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-4 py-3 text-base font-medium text-zaltyko-text-secondary hover:bg-zaltyko-primary/5 hover:text-zaltyko-primary"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/auth/login"
                className="block w-full rounded-lg px-4 py-3 text-center text-base font-semibold text-zaltyko-text-main hover:bg-zaltyko-bg"
                onClick={() => setIsMenuOpen(false)}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/onboarding"
                className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full justify-center")}
                onClick={() => setIsMenuOpen(false)}
              >
                Empezar prueba gratis
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
