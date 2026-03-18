"use client";

import Link from "next/link";
import { Menu, X, ArrowRight, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/features", label: "Características" },
  { href: "/pricing", label: "Precios" },
  { href: "/academias", label: "Academias" },
];

export default function NavbarHome() {
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
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav
        className={cn(
          "transition-all duration-300",
          scrolled
            ? "bg-white/95 backdrop-blur-lg border-b border-gray-100 shadow-sm py-2"
            : "bg-white/80 backdrop-blur-md border-b border-transparent py-3"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-red-600 to-red-700 text-white font-bold text-lg shadow-md group-hover:shadow-lg transition-all group-hover:scale-105">
                Z
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">
                Zaltyko
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/onboarding"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg rounded-full px-5"
                )}
              >
                Empezar gratis
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-100 md:hidden animate-in slide-in-from-top-5">
            <div className="space-y-1 px-4 py-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg px-4 py-3 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-red-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
                <Link
                  href="/login"
                  className="block w-full rounded-lg px-4 py-3 text-center text-base font-semibold text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/onboarding"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "w-full justify-center bg-red-600 hover:bg-red-700"
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Empezar gratis
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
