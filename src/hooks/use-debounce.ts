"use client";

import { useState, useEffect } from "react";

/**
 * Hook para debounce de valores
 * @param value - El valor a debounce
 * @param delay - El delay en milisegundos (por defecto 300ms)
 * @returns El valor con debounce
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
