"use client";

import { useState } from "react";
import { X, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface UpgradeConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan: string;
  targetPlan: string;
  price: string;
  benefits: string[];
  resource: string;
  academyId?: string | null;
}

export function UpgradeConfirmationModal({
  open,
  onClose,
  currentPlan,
  targetPlan,
  price,
  benefits,
  resource,
  academyId,
}: UpgradeConfirmationModalProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  if (!open) return null;

  const handleConfirm = () => {
    // Track event antes de navegar
    trackEvent("upgrade_clicked", {
      academyId: academyId || undefined,
      metadata: {
        fromPlan: currentPlan,
        toPlan: targetPlan,
        resource,
        price,
      },
    });

    setIsNavigating(true);
    // La navegación se manejará con el Link
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm px-4 py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Actualizar plan</h2>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Estás a punto de actualizar de <span className="font-semibold text-foreground">{currentPlan.toUpperCase()}</span> a{" "}
            <span className="font-semibold text-foreground">{targetPlan.toUpperCase()}</span> ({price}).
          </p>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Plan {targetPlan.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{price}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Beneficios incluidos:</p>
              <ul className="space-y-1.5">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              Serás redirigido a la página de facturación para completar la actualización. Podrás cancelar en cualquier momento.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <Link
            href="/billing"
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isNavigating ? "Redirigiendo..." : "Continuar a facturación"}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

