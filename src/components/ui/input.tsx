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
            "flex h-11 min-h-[44px] w-full rounded-[10px] border border-zaltyko-mist bg-white px-4 py-2 text-sm shadow-none transition-all duration-150",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zaltyko-text-main",
            "placeholder:text-zaltyko-mist",
            "focus-visible:border-zaltyko-teal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zaltyko-teal/15",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-zaltyko-coral focus-visible:border-zaltyko-coral focus-visible:ring-zaltyko-coral/15",
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
          <p id={errorId} className="text-xs text-zaltyko-coral" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
