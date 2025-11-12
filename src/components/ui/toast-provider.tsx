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

const variantConfig = {
  success: {
    icon: CheckCircle2,
    borderColor: "border-emerald-500",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    textColor: "text-emerald-800 dark:text-emerald-200",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    icon: XCircle,
    borderColor: "border-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    textColor: "text-red-800 dark:text-red-200",
    iconColor: "text-red-600 dark:text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    borderColor: "border-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    textColor: "text-amber-800 dark:text-amber-200",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  info: {
    icon: Info,
    borderColor: "border-sky-500",
    bgColor: "bg-sky-50 dark:bg-sky-950/20",
    textColor: "text-sky-800 dark:text-sky-200",
    iconColor: "text-sky-600 dark:text-sky-400",
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
        {toasts.map((toast) => {
          const config = variantConfig[toast.variant];
          const Icon = config.icon;
          
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto animate-in slide-in-from-right-full overflow-hidden rounded-lg border-l-4 shadow-lg transition-all duration-300",
                config.borderColor,
                config.bgColor
              )}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", config.iconColor)} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", config.textColor)}>{toast.title}</p>
                  {toast.description && (
                    <p className={cn("mt-1 text-sm", config.textColor, "opacity-80")}>
                      {toast.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className={cn(
                    "shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5",
                    config.textColor,
                    "opacity-60 hover:opacity-100"
                  )}
                  aria-label="Cerrar notificación"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe usarse dentro de ToastProvider");
  }
  return context;
}

