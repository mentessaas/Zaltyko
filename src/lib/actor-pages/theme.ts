/**
 * Theming tokens para actor_pages.
 * Cada actor puede customizar el render público con su propia marca.
 */

export type Theme = {
  primary_color?: string; // hex, ej. "#3b82f6"
  secondary_color?: string;
  background?: "light" | "dark" | "auto";
  font_family?: "system" | "inter" | "roboto" | "manrope" | "playfair";
  logo_url?: string;
  show_logo?: boolean;
  border_radius?: "none" | "sm" | "md" | "lg" | "full";
};

export const DEFAULT_THEME: Theme = {
  primary_color: "#3b82f6",
  secondary_color: "#1e40af",
  background: "light",
  font_family: "system",
  show_logo: true,
  border_radius: "md",
};

/**
 * Genera inline <style> tags para aplicar el tema a la página pública.
 * Sprint 4: CSS-in-JS mínimo para no requerir build pipeline adicional.
 */
export function themeToCssVars(theme: Theme | null | undefined): string {
  const t: Theme = { ...DEFAULT_THEME, ...(theme ?? {}) };
  const vars: Array<[string, string]> = [];

  // Stored theme values are untrusted and are embedded in a raw style element.
  const safeColor = (value: unknown, fallback: string) =>
    typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
      ? value
      : fallback;
  vars.push(["--z-primary", safeColor(t.primary_color, "#3b82f6")]);
  vars.push(["--z-secondary", safeColor(t.secondary_color, "#1e40af")]);

  let fontStack = "system-ui, -apple-system, sans-serif";
  if (t.font_family === "inter")
    fontStack = "'Inter', system-ui, sans-serif";
  else if (t.font_family === "roboto")
    fontStack = "'Roboto', system-ui, sans-serif";
  else if (t.font_family === "manrope")
    fontStack = "'Manrope', system-ui, sans-serif";
  else if (t.font_family === "playfair")
    fontStack = "'Playfair Display', Georgia, serif";
  vars.push(["--z-font", fontStack]);

  const radius =
    {
      none: "0",
      sm: "4px",
      md: "10px",
      lg: "16px",
      full: "9999px",
    }[t.border_radius ?? "md"] ?? "10px";
  vars.push(["--z-radius", radius]);

  return vars.map(([k, v]) => `${k}:${v}`).join(";");
}
