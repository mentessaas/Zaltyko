"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuickActionProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    badge?: number;
    onClick: () => void;
    variant?: "default" | "destructive" | "secondary" | "outline";
    disabled?: boolean;
}

export function QuickAction({
    icon,
    label,
    description,
    badge,
    onClick,
    variant = "default",
    disabled = false,
}: QuickActionProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                // Fila reglada (no tarjeta dentro de tarjeta): separador de magnesio
                // y fondo azul suave al pasar. La señal coral solo para deudas.
                "group relative flex min-h-14 w-full items-center gap-4 border-b border-chalk-line px-1 py-3 text-left transition-colors duration-150 last:border-b-0",
                "hover:bg-mat-wash",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            )}
        >
            <div
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors",
                    variant === "destructive" ? "bg-signal-wash text-signal-ink" : "bg-mat-wash text-mat"
                )}
            >
                {icon}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-foreground">{label}</h4>
                    {badge && badge > 0 ? (
                        <Badge
                            variant={variant === "destructive" ? "error" : "default"}
                            className="h-5 px-2 text-xs"
                        >
                            {badge}
                        </Badge>
                    ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {description}
                </p>
            </div>

            <div className="shrink-0 text-muted-foreground transition-colors group-hover:text-zaltyko-teal">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </div>
        </button>
    );
}
