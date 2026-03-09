"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Palette,
  Clock,
  Globe,
  CreditCard,
  Mail,
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
  { href: "billing", label: "Facturación", icon: CreditCard },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
  activeSection?: string;
}

export function SettingsLayout({ children, activeSection = "basic" }: SettingsLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar de navegación */}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Settings className="h-5 w-5" />
              Configuración
            </h2>
            <p className="text-sm text-muted-foreground">
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
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
