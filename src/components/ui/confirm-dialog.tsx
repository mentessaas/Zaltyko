"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
  loading = false,
  requireReason = false,
  reasonLabel = "Motivo de la acción",
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm(reason.trim() || undefined);
      setReason("");
      onOpenChange?.(false);
    } catch (error) {
      // Error manejado por el componente padre
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    setReason("");
    onOpenChange?.(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-mat-night/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            // Panel reglado de diálogo: cinta blanca, borde de línea de magnesio,
            // regla superior de 3 px en noche y radio de modal (16 px).
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-6 text-mat-night shadow-medium duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-modal",
            variant === "destructive" && "border-signal/30 border-t-signal-ink"
          )}
        >
          <div className="flex items-start gap-4">
            {variant === "destructive" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-signal-wash">
                <AlertTriangle className="h-5 w-5 text-signal-ink" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <DialogPrimitive.Title className="font-display text-2xl font-black uppercase leading-none text-mat-night">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-ramp-600">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              onClick={handleCancel}
              className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ramp-600 ring-offset-background transition-colors hover:bg-chalk hover:text-mat-night focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
          </div>
          {requireReason && (
            <div className="space-y-2">
              <label htmlFor="confirm-dialog-reason" className="text-sm font-semibold text-mat-night">
                {reasonLabel}
              </label>
              <Textarea
                id="confirm-dialog-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explica brevemente por qué es necesaria esta acción"
                className="min-h-20"
              />
              <p className="text-xs text-ramp-600">Mínimo 5 caracteres. Se guardará en el historial de actividad.</p>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading || loading}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={isLoading || loading || (requireReason && reason.trim().length < 5)}
            >
              {isLoading || loading ? "Procesando..." : confirmText}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
