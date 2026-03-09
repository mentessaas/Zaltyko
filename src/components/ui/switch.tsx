"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Label text to associate with the switch */
  label?: string;
  /** Error message to display */
  error?: string;
}

/**
 * Accessible Switch (toggle) component with proper label association
 *
 * @example
 * ```tsx
 * <Switch
 *   label="Notificaciones push"
 *   checked={notifications}
 *   onCheckedChange={setNotifications}
 * />
 * ```
 *
 * WCAG 2.1: Ensures accessible name through label association
 * Uses role="switch" for proper semantic meaning
 */
export function Switch({
  className,
  checked,
  onCheckedChange,
  onChange,
  label,
  error,
  id,
  ...props
}: SwitchProps) {
  const switchId = React.useId();
  const actualId = id || switchId;
  const errorId = `${actualId}-error`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onCheckedChange) {
      onCheckedChange(e.target.checked);
    }
    onChange?.(e);
  };

  const LabelComponent = (
    <span
      className={cn(
        "text-sm text-zaltyko-text-main",
        props.disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {label && (
          <label
            htmlFor={actualId}
            className={cn(
              "flex-1",
              props.disabled && "cursor-not-allowed"
            )}
          >
            {LabelComponent}
          </label>
        )}
        <label
          htmlFor={actualId}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            "focus-within:outline-none focus-within:ring-2 focus-within:ring-zaltyko-primary focus-within:ring-offset-2",
            checked ? "bg-zaltyko-primary" : "bg-zaltyko-border",
            props.disabled && "opacity-50 cursor-not-allowed",
            !props.disabled && "cursor-pointer",
            error && "!bg-red-500",
            className
          )}
        >
          <input
            type="checkbox"
            id={actualId}
            role="switch"
            className="sr-only"
            checked={checked}
            onChange={handleChange}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            aria-label={label || props["aria-label"]}
            {...props}
          />
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-6" : "translate-x-1"
            )}
            aria-hidden="true"
          />
        </label>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

