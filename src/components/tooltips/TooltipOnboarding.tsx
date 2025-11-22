"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface TooltipOnboardingProps {
  tooltipId: string;
  message: string;
  children: React.ReactNode;
  className?: string;
}

export function TooltipOnboarding({ tooltipId, message, children, className }: TooltipOnboardingProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/tooltips", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudo cargar preferencias");
      }
      const json = (await response.json()) as { tooltipFlags?: Record<string, boolean> };
      setVisible(!json.tooltipFlags?.[tooltipId]);
    } catch {
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }, [tooltipId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const markAsSeen = async () => {
    setVisible(false);
    try {
      await fetch("/api/tooltips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: tooltipId }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className={`relative inline-flex flex-col gap-2 ${className ?? ""}`}>
      {children}
      {!loading && visible && (
        <div className="w-full max-w-xs rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs shadow-lg">
          <p className="text-primary">{message}</p>
          <div className="mt-3 text-right">
            <Button size="xs" variant="ghost" onClick={markAsSeen}>
              Entendido
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


