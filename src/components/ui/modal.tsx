"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}

export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  widthClassName = "w-full max-w-xl",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Guardar el elemento con foco antes de abrir el modal
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Foco inicial en el modal
    modalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // Prevenir scroll del body cuando el modal está abierto
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", onKeyDown);

      // Restaurar foco al elemento que abrió el modal
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-mat-night/55 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
      onClick={onClose}
    >
      {/* Panel reglado de diálogo: cinta blanca, borde de línea de magnesio, regla
          superior de 3 px en noche, radio de modal (16 px) y sombra de overlay. */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden rounded-modal border border-chalk-line border-t-[3px] border-t-mat-night bg-white text-mat-night shadow-medium sm:max-h-[calc(100dvh-4rem)] ${widthClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-chalk-line px-6 py-4">
          <h2 id="modal-title" className="font-display text-2xl font-black uppercase leading-none text-mat-night">{title}</h2>
          {description && (
            <p id="modal-description" className="mt-2 text-sm text-ramp-600">
              {description}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-chalk-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
