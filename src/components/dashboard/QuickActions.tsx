"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  UserPlus,
  Calendar,
  ClipboardCheck,
  FileText,
  CreditCard,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: (academyId: string) => string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-athlete",
    label: "Añadir atleta",
    description: "Registra un nuevo atleta en tu academia",
    icon: UserPlus,
    href: (id) => `/app/${id}/athletes?action=create`,
    color: "bg-blue-500",
  },
  {
    id: "create-class",
    label: "Crear clase",
    description: "Programa una nueva clase o sesión",
    icon: Calendar,
    href: (id) => `/app/${id}/classes?action=create`,
    color: "bg-emerald-500",
  },
  {
    id: "take-attendance",
    label: "Pasar asistencia",
    description: "Registra la asistencia de hoy",
    icon: ClipboardCheck,
    href: (id) => `/app/${id}/attendance?date=today`,
    color: "bg-amber-500",
  },
  {
    id: "create-report",
    label: "Generar reporte",
    description: "Crea un reporte de asistencia o financiero",
    icon: FileText,
    href: (id) => `/app/${id}/reports/attendance`,
    color: "bg-purple-500",
  },
  {
    id: "configure-payment",
    label: "Configurar pago",
    description: "Gestiona métodos de pago y facturación",
    icon: CreditCard,
    href: () => `/billing`,
    color: "bg-green-500",
  },
];

interface QuickActionsProps {
  academyId: string;
  className?: string;
}

export function QuickActions({ academyId, className }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-primary/90 hover:scale-110",
          className
        )}
        aria-label="Abrir acciones rápidas"
      >
        <Plus className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3">
      <div className="flex items-center justify-end gap-2">
        <div className="rounded-lg border bg-card p-1 shadow-lg">
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border bg-card p-2 shadow-lg">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              href={action.href(academyId)}
              className="flex items-center gap-3 rounded-md px-4 py-3 transition hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              <div className={cn("rounded-md p-2 text-white", action.color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

