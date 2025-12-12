"use client";

import Link from "next/link";
import { Calendar, UserPlus, ClipboardCheck, FileText, CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickAccessBarProps {
  academyId: string;
}

const QUICK_ACCESS_ITEMS = [
  {
    label: "Añadir atleta",
    href: (id: string) => `/app/${id}/athletes?action=create`,
    icon: UserPlus,
    color: "text-blue-600 dark:text-blue-400",
  },
  {
    label: "Crear clase",
    href: (id: string) => `/app/${id}/classes?action=create`,
    icon: Calendar,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Pasar asistencia",
    href: (id: string) => `/app/${id}/attendance?date=today`,
    icon: ClipboardCheck,
    color: "text-amber-600 dark:text-amber-400",
  },
  {
    label: "Reportes",
    href: (id: string) => `/app/${id}/reports/attendance`,
    icon: FileText,
    color: "text-purple-600 dark:text-purple-400",
  },
  {
    label: "Facturación",
    href: () => `/billing`,
    icon: CreditCard,
    color: "text-green-600 dark:text-green-400",
  },
];

export function QuickAccessBar({ academyId }: QuickAccessBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Plus className="h-3.5 w-3.5" />
        Accesos rápidos:
      </div>
      {QUICK_ACCESS_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href(academyId)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Icon className={`h-3.5 w-3.5 ${item.color}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

