"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeatureHintProps {
  id: string;
  title: string;
  description: string;
  cta?: {
    label: string;
    href: string;
  };
  variant?: "info" | "tip" | "new";
  dismissible?: boolean;
  className?: string;
}

const STORAGE_KEY = "zaltyko_feature_hints_dismissed";

export function FeatureHint({
  id,
  title,
  description,
  cta,
  variant = "info",
  dismissible = true,
  className,
}: FeatureHintProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissedHints = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
    if (dismissedHints.includes(id)) {
      setDismissed(true);
    }
  }, [id]);

  const handleDismiss = () => {
    if (typeof window === "undefined") return;
    const dismissedHints = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
    dismissedHints.push(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissedHints));
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  const variantStyles = {
    info: "border-blue-200 bg-blue-50/80 text-blue-900",
    tip: "border-amber-200 bg-amber-50/80 text-amber-900",
    new: "border-primary/30 bg-primary/10 text-primary",
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <h4 className="font-semibold text-sm">{title}</h4>
          <p className="text-sm opacity-90">{description}</p>
          {cta && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-2"
            >
              <a href={cta.href}>{cta.label}</a>
            </Button>
          )}
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1 transition hover:bg-background/50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

