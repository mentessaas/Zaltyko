"use client";

import Link from "next/link";
import { BarChart3, Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "#caracteristicas", label: "Características" },
  { href: "#modulos", label: "Módulos" },
  { href: "#planes", label: "Planes" },
  { href: "#faq", label: "FAQs" },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#111315]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-[#0d1b1e]">
            <BarChart3 className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">GymnaSaaS</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex">
          <Link
            href="/onboarding"
            className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-sm font-semibold text-[#0d1b1e] transition hover:from-emerald-300 hover:to-lime-200"
          >
            Crear academia demo
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-md p-2 text-white md:hidden"
        >
          <span className="sr-only">Abrir menú</span>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="border-t border-white/10 bg-[#111315] md:hidden">
          <div className="space-y-1 px-4 py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2 text-base font-medium text-white/80 hover:bg-white/5 hover:text-white"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/onboarding"
              className="mt-4 block rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-3 py-2 text-center text-sm font-semibold text-[#0d1b1e]"
              onClick={() => setIsMenuOpen(false)}
            >
              Crear academia demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
