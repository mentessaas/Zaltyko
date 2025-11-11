"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";

import { useAcademyContext } from "@/hooks/use-academy-context";
import { getRoleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";

const NAV_SECTIONS = [
  {
    label: "Resumen",
    items: [
      { href: (id: string) => `/app/${id}/dashboard`, text: "Dashboard" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: (id: string) => `/app/${id}/athletes`, text: "Atletas" },
      { href: (id: string) => `/app/${id}/coaches`, text: "Entrenadores" },
      { href: (id: string) => `/app/${id}/classes`, text: "Clases y sesiones" },
      { href: (id: string) => `/app/${id}/attendance`, text: "Asistencia" },
    ],
  },
  {
    label: "Negocio",
    items: [
      { href: (id: string) => `/app/${id}/billing`, text: "Facturación" },
      { href: (id: string) => `/app/${id}/assessments`, text: "Evaluaciones" },
    ],
  },
];

export function AcademySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();

  const basePath = `/app/${context.academyId}`;

  const isActive = (href: string) => {
    if (href === basePath) {
      return pathname === href;
    }
    return pathname?.startsWith(href);
  };

  return (
    <aside className="hidden w-64 flex-col border-r border-border/80 bg-card/40 p-4 lg:flex">
      {context.isSuperAdmin && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-emerald-500/60 bg-emerald-500/20 text-emerald-100 font-semibold shadow-sm hover:border-emerald-400 hover:bg-emerald-500/30 hover:text-white"
            onClick={() => router.push("/super-admin/academies")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
            Volver a Super Admin
          </Button>
        </div>
      )}
      <nav className="space-y-6 text-sm">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const href = item.href(context.academyId);
                const active = isActive(href);
                return (
                  <li key={item.text}>
                    <Link
                      href={href}
                      className={`flex items-center justify-between rounded-md px-3 py-2 transition ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>{item.text}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

    </aside>
  );
}


