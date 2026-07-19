/**
 * Convierte un timestamp de Unix a Date
 */
export function unixToDate(value?: number | null): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

