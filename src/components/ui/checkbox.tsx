"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text to associate with the checkbox */
  label?: string;
  /** Error message to display */
  error?: string;
}

/**
 * Accessible Checkbox component with proper label association
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="Acepto los términos y condiciones"
 *   checked={checked}
 *   onChange={(e) => setChecked(e.target.checked)}
 * />
 * ```
 *
 * WCAG 2.1: Ensures accessible name through label association
 */
export function Checkbox({ className = "", label, error, id, ...props }: CheckboxProps) {
  const checkboxId = React.useId();
  const actualId = id || checkboxId;
  const errorId = `${actualId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <input
            type="checkbox"
            id={actualId}
            className={cn(
              "h-4 w-4 rounded border border-zaltyko-border text-zaltyko-primary",
              "focus:ring-2 focus:ring-zaltyko-primary focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "accent-zaltyko-primary",
              error && "border-red-500 focus:ring-red-500",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          <Check
            className={cn(
              "absolute h-3 w-3 text-white pointer-events-none",
              props.checked ? "opacity-100" : "opacity-0"
            )}
            strokeWidth={3}
            aria-hidden="true"
          />
        </div>
        {label && (
          <label
            htmlFor={actualId}
            className={cn(
              "text-sm text-zaltyko-text-main cursor-pointer",
              props.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {label}
          </label>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

