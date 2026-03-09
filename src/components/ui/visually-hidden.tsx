"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface VisuallyHiddenProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** When true, the element becomes visible on focus (useful for form errors) */
  focusable?: boolean;
  /** Children to render */
  children: React.ReactNode;
}

/**
 * VisuallyHidden component - Hides content visually but keeps it accessible to screen readers
 *
 * @example
 * ```tsx
 * // Basic usage - screen reader only text
 * <VisuallyHidden>Texto solo para lectores de pantalla</VisuallyHidden>
 *
 * // Focusable - shows on keyboard focus (useful for error messages)
 * <VisuallyHidden focusable>
 *   Error: El campo es requerido
 * </VisuallyHidden>
 * ```
 *
 * WCAG 2.1 Success Criterion 1.1.1 (Non-text Content)
 * Used to provide text alternatives for visual content
 */
export function VisuallyHidden({
  children,
  focusable = false,
  className,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span
      className={cn(
        // Base styles - completely hidden visually
        "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0",
        // Clip technique for maximum browser support
        "[clip:rect(0,0,0,0)]",
        // When focusable, show on focus
        focusable
          ? "peer-focus:static peer-focus:w-auto peer-focus:h-auto peer-focus:p-2 peer-focus:m-0 peer-focus:overflow-visible peer-focus:[clip:auto] peer-focus:whitespace-normal peer-focus:border peer-focus:bg-red-50 peer-focus:text-red-600 peer-focus:text-sm peer-focus:z-50"
          : // Always hidden from sight but available to screen readers
            "",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default VisuallyHidden;
