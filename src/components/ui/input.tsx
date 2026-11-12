import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Campo «Magnesio sobre tapiz», compartido por `Input`, `Select` y `Textarea`:
 * cinta blanca, borde de 1 px en línea de magnesio, radio de 10 px (`card`),
 * 44 px de alto y foco con borde tapiz más anillo de 4 px al 15 %. De noche,
 * The Night Mat Rule pasa el blanco a la tarjeta nocturna y la tinta a magnesio.
 */
export const fieldControlClassName =
  "flex min-h-[44px] w-full rounded-card border border-chalk-line bg-white text-sm text-mat-night shadow-none transition-[border-color,box-shadow] duration-150 placeholder:text-ramp-500 dark:placeholder:text-ramp-400 focus-visible:border-mat focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mat/15 dark:focus-visible:border-mat-lane disabled:cursor-not-allowed disabled:opacity-50";

/** Error de campo: línea de señal (no letra) y anillo de señal al 40 %. */
export const fieldControlErrorClassName =
  "border-signal focus-visible:border-signal focus-visible:ring-signal/40";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Error message to display */
  error?: string;
  /** Help text to display below input */
  helpText?: string;
}

/**
 * Accessible Input component with improved placeholder contrast
 *
 * @example
 * ```tsx
 * <Input
 *   label="Correo electrónico"
 *   type="email"
 *   placeholder="tu@email.com"
 *   required
 *   aria-describedby="email-help"
 * />
 * ```
 *
 * WCAG 2.1: Placeholder text now has better contrast (text-secondary)
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, helpText, id, required, ...props }, ref) => {
    const inputId = React.useId();
    const actualId = id || inputId;
    const helpTextId = `${actualId}-help`;
    const errorId = `${actualId}-error`;

    return (
      <div className="space-y-1">
        <input
          type={type}
          id={actualId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helpText ? helpTextId : undefined}
          aria-required={required}
          className={cn(
            fieldControlClassName,
            "h-11 px-4 py-2",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-mat-night",
            error && fieldControlErrorClassName,
            className
          )}
          ref={ref}
          suppressHydrationWarning
          {...props}
        />
        {helpText && !error && (
          <p id={helpTextId} className="text-xs text-ramp-600">
            {helpText}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs font-medium text-signal-ink dark:text-signal-light" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
