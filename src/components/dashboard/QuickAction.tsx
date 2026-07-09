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
                "group relative flex w-full items-center gap-4 rounded-2xl border border-zaltyko-mist bg-white p-4 text-left shadow-soft transition-all duration-150",
                "hover:border-zaltyko-teal/40 hover:bg-zaltyko-white",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-zaltyko-mist disabled:hover:bg-white disabled:hover:shadow-soft",
                variant === "destructive" && "border-zaltyko-coral/40 bg-zaltyko-coral/5",
                variant === "secondary" && "border-zaltyko-indigo/25 bg-zaltyko-indigo/5"
            )}
        >
            <div
                className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors",
                    variant === "default" && "bg-zaltyko-teal/12 text-zaltyko-teal",
                    variant === "destructive" && "bg-zaltyko-coral/12 text-zaltyko-coral",
                    variant === "secondary" && "bg-zaltyko-indigo/10 text-zaltyko-indigo",
                    variant === "outline" && "bg-zaltyko-white text-zaltyko-indigo"
                )}
            >
                {icon}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-zaltyko-navy">{label}</h4>
                    {badge && badge > 0 ? (
                        <Badge
                            variant={variant === "destructive" ? "error" : "default"}
                            className="h-5 px-2 text-xs"
                        >
                            {badge}
                        </Badge>
                    ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-zaltyko-text-secondary">
                    {description}
                </p>
            </div>

            <div className="shrink-0 text-slate-600 transition-colors group-hover:text-zaltyko-teal">
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
