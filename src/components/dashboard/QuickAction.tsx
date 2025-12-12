"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
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
                "group relative flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-all",
                "hover:border-primary hover:bg-accent hover:shadow-md",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:shadow-none",
                variant === "destructive" && "border-destructive/50 bg-destructive/5",
                variant === "secondary" && "border-secondary/50 bg-secondary/5"
            )}
        >
            <div
                className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                    variant === "default" && "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                    variant === "destructive" && "bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground",
                    variant === "secondary" && "bg-secondary/10 text-secondary-foreground group-hover:bg-secondary",
                    variant === "outline" && "bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground",
                    disabled && "group-hover:bg-opacity-10"
                )}
            >
                {icon}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm truncate">{label}</h4>
                    {badge && badge > 0 ? (
                        <Badge
                            variant={variant === "destructive" ? "error" : "default"}
                            className="h-5 px-2 text-xs"
                        >
                            {badge}
                        </Badge>
                    ) : null}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {description}
                </p>
            </div>

            <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
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
