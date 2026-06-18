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
  { href: "/academias", label: "Academias" },
  { href: "/events", label: "Eventos" },
  { href: "/features", label: "Producto" },
  { href: "/pricing", label: "Precios" },
  { href: "/help", label: "Ayuda" },
];

export default function Navbar() {
  const pathname = usePathname();
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
        <div className="hidden items-center gap-2 rounded-2xl border border-zaltyko-mist/70 bg-white/80 px-2 py-1 shadow-soft md:flex">
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
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/auth/login"
            className="text-sm font-semibold text-zaltyko-text-main hover:text-zaltyko-primary transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/contact?type=demo"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full px-6")}
          >
            Solicitar demo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-zaltyko-text-main hover:bg-zaltyko-bg md:hidden"
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute left-0 top-full w-full animate-in border-b border-zaltyko-mist bg-white shadow-soft md:hidden slide-in-from-top-5">
          <div className="space-y-2 px-4 py-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isPublicNavigationActive(pathname, link.href) ? "page" : undefined}
                className="block rounded-lg px-4 py-3 text-base font-medium text-zaltyko-text-secondary hover:bg-zaltyko-teal/10 hover:text-zaltyko-teal"
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
                href="/contact?type=demo"
                className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full justify-center")}
                onClick={() => setIsMenuOpen(false)}
              >
                Solicitar demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
