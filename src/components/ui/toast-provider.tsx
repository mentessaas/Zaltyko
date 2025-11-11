"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastVariant = "success" | "error" | "info";

interface ToastDefinition {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  pushToast: (toast: { title: string; description?: string; variant?: ToastVariant; duration?: number }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

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
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      duration?: number;
    }) => {
      const id = crypto.randomUUID();
      const toast: ToastDefinition = { id, title, description, variant, duration };
      setToasts((prev) => [...prev, toast]);

      const timerId = window.setTimeout(() => {
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timerId);
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
      <div className="pointer-events-none fixed bottom-6 right-6 z-[2000] flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-lg border bg-card shadow-lg`}
          >
            <div
              className={`flex items-start gap-3 border-l-4 px-4 py-3 ${
                toast.variant === "success"
                  ? "border-emerald-500"
                  : toast.variant === "error"
                  ? "border-red-500"
                  : "border-sky-500"
              }`}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                {toast.description && (
                  <p className="text-sm text-muted-foreground">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
          </div>
        ))}
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

