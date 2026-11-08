"use client";

import { Building2, Palette, Clock, Globe, CreditCard } from "lucide-react";

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
  // Las pestañas de la propia página ya navegan entre secciones; una segunda
  // navegación lateral duplicaba lo mismo. Se conserva la API (activeSection)
  // para no romper a quien la use.
  void activeSection;
  void SETTINGS_NAV;
  return <div className="min-w-0">{children}</div>;
}
