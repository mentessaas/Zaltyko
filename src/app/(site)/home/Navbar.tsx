"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { isPublicNavigationActive } from "@/lib/navigation/active";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/features", label: "Producto" },
  { href: "/pricing", label: "Precios" },
  { href: "/academias", label: "Academias" },
];

export default function NavbarHome() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mounted]);

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
              <Image
                src="/branding/zaltyko/logo-zaltyko.svg"
                alt="Zaltyko"
                width={200}
                height={60}
                className="transition-transform duration-150 group-hover:scale-[1.02]"
                style={{ width: 132, height: "auto" }}
                priority
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2 rounded-2xl border border-zaltyko-mist/70 bg-white/80 px-2 py-1 shadow-soft">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isPublicNavigationActive(pathname, link.href) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-xl border border-transparent px-4 py-2 text-sm font-medium transition-colors",
                    isPublicNavigationActive(pathname, link.href)
                      ? "border-zaltyko-teal/20 bg-zaltyko-teal/10 text-zaltyko-teal"
                      : "text-zaltyko-text-secondary hover:bg-zaltyko-white hover:text-zaltyko-teal"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/auth/login"
                className="text-sm font-semibold text-zaltyko-navy transition-colors hover:text-zaltyko-teal"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/contact?type=demo"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "rounded-full px-5 shadow-soft"
                )}
              >
                Solicitar demo
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-zaltyko-text-secondary hover:bg-zaltyko-warm-white md:hidden"
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="absolute top-full left-0 right-0 animate-in border-b border-zaltyko-mist bg-white md:hidden slide-in-from-top-5">
            <div className="space-y-1 px-4 py-6">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isPublicNavigationActive(pathname, link.href) ? "page" : undefined}
                  className="block rounded-lg px-4 py-3 text-base font-medium text-zaltyko-text-secondary hover:bg-zaltyko-warm-white hover:text-zaltyko-teal"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-6 space-y-3 border-t border-zaltyko-mist pt-4">
                <Link
                  href="/auth/login"
                  className="block w-full rounded-lg px-4 py-3 text-center text-base font-semibold text-zaltyko-navy hover:bg-zaltyko-warm-white"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/contact?type=demo"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "w-full justify-center"
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Solicitar demo
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
