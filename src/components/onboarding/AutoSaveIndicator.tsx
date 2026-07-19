"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSaveIndicatorProps {
  isSaving?: boolean;
  lastSaved?: Date | null;
  className?: string;
}

export function AutoSaveIndicator({
  isSaving = false,
  lastSaved,
  className,
}: AutoSaveIndicatorProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isSaving) {
      setShow(true);
    } else if (lastSaved) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, lastSaved]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs",
        className
      )}
    >
      {isSaving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Guardando...</span>
        </>
      ) : (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-muted-foreground">
            Guardado {lastSaved && formatTimeAgo(lastSaved)}
          </span>
        </>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 10) return "ahora";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  return "recientemente";
}

