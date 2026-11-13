"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastDefinition {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  persistent?: boolean;
}

interface ToastContextValue {
  pushToast: (toast: { 
    title: string; 
    description?: string; 
    variant?: ToastVariant; 
    duration?: number;
    persistent?: boolean;
  }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Tonos de estado del sistema (DESIGN.md, «Tonos de estado»):
 * - success: lavado tapiz con texto zona de seguridad.
 * - info: polvo de magnesio con texto noche e icono tapiz.
 * - warning: aviso en ocre (tinta ocre oscura sobre lavado ocre claro).
 * - error: lavado señal con `signal-ink`. Solo error, deuda o borrado.
 * Los lavados y tintas se adaptan de noche por The Night Mat Rule.
 */
const variantConfig = {
  success: {
    icon: CheckCircle2,
    borderColor: "border-mat/25",
    bgColor: "bg-mat-wash",
    textColor: "text-mat-deep",
    iconColor: "text-mat dark:text-mat-lane",
  },
  error: {
    icon: XCircle,
    borderColor: "border-signal/30",
    bgColor: "bg-signal-wash",
    textColor: "text-signal-ink",
    iconColor: "text-signal-ink",
  },
  warning: {
    icon: AlertTriangle,
    borderColor: "border-ochre-line",
    bgColor: "bg-ochre-wash",
    textColor: "text-ochre-ink",
    iconColor: "text-ochre-ink",
  },
  info: {
    icon: Info,
    borderColor: "border-chalk-line",
    bgColor: "bg-chalk-dust",
    textColor: "text-mat-night",
    iconColor: "text-mat dark:text-mat-lane",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastDefinition[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timerId = timersRef.current.get(id);
    if (timerId) {
      clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    ({
      title,
      description,
      variant = "info",
      duration = 4000,
      persistent = false,
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      duration?: number;
      persistent?: boolean;
    }) => {
      const id = crypto.randomUUID();
      const toast: ToastDefinition = { id, title, description, variant, duration, persistent };
      setToasts((prev) => [...prev, toast]);

      if (!persistent && duration > 0) {
        const timerId = window.setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timerId);
      }
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast,
    }),
    [pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-full max-w-md flex-col gap-3 px-4 sm:bottom-6 sm:right-6 sm:px-0">
        <ToastLiveRegion
          aria-live="polite"
          toasts={toasts.filter((t) => t.variant === "info" || t.variant === "success")}
          onDismiss={dismissToast}
        />
        <ToastLiveRegion
          aria-live="assertive"
          toasts={toasts.filter((t) => t.variant === "error" || t.variant === "warning")}
          onDismiss={dismissToast}
        />
      </div>
    </ToastContext.Provider>
  );
}

interface ToastLiveRegionProps {
  toasts: ToastDefinition[];
  onDismiss: (id: string) => void;
  "aria-live": "polite" | "assertive";
}

function ToastLiveRegion({ toasts, onDismiss, "aria-live": ariaLive }: ToastLiveRegionProps) {
  if (toasts.length === 0) return null;
  const role = ariaLive === "assertive" ? "alert" : "status";
  return (
    <div role={role} aria-live={ariaLive} aria-atomic="true" className="flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastDefinition; onDismiss: (id: string) => void }) {
  const config = variantConfig[toast.variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto animate-in slide-in-from-right-full overflow-hidden rounded-card border shadow-medium transition-colors duration-300",
        config.borderColor,
        config.bgColor
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", config.iconColor)} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", config.textColor)}>{toast.title}</p>
          {toast.description && (
            <p className={cn("mt-1 text-sm", config.textColor)}>
              {toast.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={cn(
            "-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-mat-night/5 dark:hover:bg-white/10",
            config.textColor,
            "opacity-70 hover:opacity-100"
          )}
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe usarse dentro de ToastProvider");
  }
  return context;
}

