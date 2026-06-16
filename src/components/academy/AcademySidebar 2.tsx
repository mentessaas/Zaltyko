"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  GraduationCap,
  FolderTree,
  Calendar,
  ClipboardCheck,
  CalendarDays,
  FileText,
  TrendingUp,
  DollarSign,
  Award,
  Receipt,
  FileSearch,
  BarChart3,
  Shield,
  Badge,
  Settings,
  Search,
  Upload,
  Download,
} from "lucide-react";

import { useAcademyContext } from "@/hooks/use-academy-context";
import { getRoleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  href: (id: string) => string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "new" | "important";
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Principal",
    items: [
      { href: (id: string) => `/app/${id}/dashboard`, text: "Dashboard", icon: LayoutDashboard },
      { href: (id: string) => `/app/${id}/athletes`, text: "Atletas", icon: Users },
      { href: (id: string) => `/app/${id}/classes`, text: "Clases", icon: Calendar },
      { href: (id: string) => `/app/${id}/events`, text: "Eventos", icon: CalendarDays },
      { href: (id: string) => `/app/${id}/reports/attendance`, text: "Reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Ajustes",
    items: [
      { href: (id: string) => `/app/${id}/settings`, text: "Configuración", icon: Settings },
      { href: (id: string) => `/app/${id}/coaches`, text: "Entrenadores", icon: GraduationCap },
      { href: (id: string) => `/app/${id}/billing`, text: "Facturación", icon: Receipt },
    ],
  },
];

export function AcademySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useAcademyContext();
  const [searchQuery, setSearchQuery] = useState("");

  // Verificación de seguridad para evitar errores cuando el contexto no está disponible
  if (!context?.academyId) {
    return null;
  }

  const basePath = `/app/${context.academyId}`;

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === basePath) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Quick search handler
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`${basePath}/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <aside className="hidden w-64 flex-col border-r border-border/80 bg-card/40 p-4 lg:flex">
      {/* Global Search */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar en la academia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </form>

      {/* Quick Actions */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push(`${basePath}/athletes/new`)}
        >
          <Upload className="mr-1 h-3 w-3" />
          Importar
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => router.push(`${basePath}/settings/export`)}
        >
          <Download className="mr-1 h-3 w-3" />
          Exportar
        </Button>
      </div>

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
                const Icon = item.icon;
                return (
                  <li key={item.text}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 transition",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.text}</span>
                      {item.badge === "new" && (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Nuevo
                        </span>
                      )}
                      {item.badge === "important" && (
                        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          !
                        </span>
                      )}
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


