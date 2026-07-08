"use client";

import Link from "next/link";
import {
  Building2,
  Palette,
  Clock,
  Globe,
  CreditCard,
  Settings,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "basic", label: "Información básica", icon: Building2 },
  { href: "branding", label: "Branding", icon: Palette },
  { href: "schedule", label: "Horarios", icon: Clock },
  { href: "contact", label: "Contacto", icon: Globe },
  { href: "billing", label: "Cobros", icon: CreditCard },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
  activeSection?: string;
}

export function SettingsLayout({ children, activeSection = "basic" }: SettingsLayoutProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64">
        <div className="overflow-hidden rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
          <div className="border-b border-zaltyko-mist bg-zaltyko-navy px-4 py-5 text-white">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Settings className="h-5 w-5 text-zaltyko-teal" />
              Configuración
            </h2>
            <p className="text-sm text-slate-300">
              Ajusta la configuración de tu academia
            </p>
          </div>
          <nav className="p-2">
            {SETTINGS_NAV.map((item) => {
              const isActive = activeSection === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={`#${item.href}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-zaltyko-teal/10 font-medium text-zaltyko-teal"
                      : "text-zaltyko-text-secondary hover:bg-zaltyko-warm-white hover:text-zaltyko-navy"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
