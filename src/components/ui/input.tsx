import * as React from "react";

import { cn } from "@/lib/utils";

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
            "flex h-11 w-full rounded-xl border border-zaltyko-border bg-white/50 px-4 py-2 text-sm shadow-soft transition-all duration-200",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zaltyko-text-main",
            // Improved placeholder contrast - using text-secondary instead of text-light
            "placeholder:text-zaltyko-text-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary-light focus-visible:ring-offset-2 focus-visible:border-zaltyko-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-h-[44px]",
            error && "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {helpText && !error && (
          <p id={helpTextId} className="text-xs text-zaltyko-text-secondary">
            {helpText}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
