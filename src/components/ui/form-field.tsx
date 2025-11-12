"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface FormFieldProps extends React.ComponentProps<"input"> {
  label: string;
  error?: string;
  success?: boolean;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
  validator?: (value: string) => string | null;
  description?: string;
}

export function FormField({
  label,
  error,
  success,
  validateOnBlur = true,
  validateOnChange = false,
  validator,
  description,
  className,
  onBlur,
  onChange,
  ...props
}: FormFieldProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [value, setValue] = useState(props.value?.toString() || props.defaultValue?.toString() || "");

  const validate = useCallback(
    (val: string) => {
      if (!validator) return null;
      return validator(val);
    },
    [validator]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      if (validateOnBlur && validator) {
        const validationError = validate(e.target.value);
        setLocalError(validationError || null);
      }
      onBlur?.(e);
    },
    [validateOnBlur, validator, validate, onBlur]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      if (validateOnChange && touched && validator) {
        const validationError = validate(e.target.value);
        setLocalError(validationError || null);
      }
      onChange?.(e);
    },
    [validateOnChange, touched, validator, validate, onChange]
  );

  useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value.toString());
    }
  }, [props.value]);

  const displayError = error || (touched ? localError : null);
  const isValid = !displayError && touched && value.length > 0 && success !== false;

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id} className="text-sm font-semibold">
        {label}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="relative">
        <Input
          {...props}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(
            displayError && "border-red-500 focus-visible:ring-red-500",
            isValid && "border-emerald-500 focus-visible:ring-emerald-500",
            className
          )}
          aria-invalid={!!displayError}
          aria-describedby={displayError ? `${props.id}-error` : undefined}
        />
        {isValid && (
          <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
        )}
        {displayError && (
          <AlertCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
        )}
      </div>
      {displayError && (
        <p id={`${props.id}-error`} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}

// Validadores comunes
export const validators = {
  required: (message = "Este campo es obligatorio") => (value: string) => {
    if (!value || value.trim().length === 0) return message;
    return null;
  },
  email: (message = "Correo electrónico inválido") => (value: string) => {
    if (!value) return null; // Si está vacío, required se encargará
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return message;
    return null;
  },
  minLength: (min: number, message?: string) => (value: string) => {
    if (!value) return null;
    const msg = message || `Debe tener al menos ${min} caracteres`;
    if (value.length < min) return msg;
    return null;
  },
  maxLength: (max: number, message?: string) => (value: string) => {
    if (!value) return null;
    const msg = message || `Debe tener máximo ${max} caracteres`;
    if (value.length > max) return msg;
    return null;
  },
  pattern: (regex: RegExp, message: string) => (value: string) => {
    if (!value) return null;
    if (!regex.test(value)) return message;
    return null;
  },
  combine: (...validators: Array<(value: string) => string | null>) => (value: string) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  },
};

