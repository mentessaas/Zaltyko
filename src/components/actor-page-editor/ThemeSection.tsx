"use client";

type Theme = {
  primary_color?: string;
  secondary_color?: string;
  background?: "light" | "dark" | "auto";
  font_family?: "system" | "inter" | "roboto" | "manrope" | "playfair";
  logo_url?: string;
  show_logo?: boolean;
  border_radius?: "none" | "sm" | "md" | "lg" | "full";
};

const FONT_OPTIONS: Array<{ value: NonNullable<Theme["font_family"]>; label: string }> = [
  { value: "system", label: "Sistema" },
  { value: "inter", label: "Inter (sans)" },
  { value: "roboto", label: "Roboto (sans)" },
  { value: "manrope", label: "Manrope (sans)" },
  { value: "playfair", label: "Playfair (serif)" },
];

const BG_OPTIONS: Array<{ value: NonNullable<Theme["background"]>; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "auto", label: "Auto (sistema)" },
];

const RADIUS_OPTIONS: Array<{ value: NonNullable<Theme["border_radius"]>; label: string }> = [
  { value: "none", label: "Sin radio" },
  { value: "sm", label: "Suave" },
  { value: "md", label: "Medio" },
  { value: "lg", label: "Pronunciado" },
  { value: "full", label: "Píldora" },
];

export function ThemeSection({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (next: Theme) => void;
}) {
  function patch<K extends keyof Theme>(key: K, value: Theme[K]) {
    onChange({ ...theme, [key]: value });
  }
  return (
    <section style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #f1f5f9" }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: "#0f172a",
          marginBottom: 6,
        }}
      >
        Tema visual
      </label>
      <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
        Estos ajustes afectan solo a la página pública. Sprint 4+.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Color principal (hex)">
          <input
            type="color"
            value={theme.primary_color ?? "#3b82f6"}
            onChange={(e) => patch("primary_color", e.target.value)}
            style={{ width: "100%", height: 38, border: "1px solid #cbd5e1", borderRadius: 6 }}
          />
        </Field>
        <Field label="Fondo">
          <select
            value={theme.background ?? "light"}
            onChange={(e) => patch("background", e.target.value as NonNullable<Theme["background"]>)}
            style={selectStyle}
          >
            {BG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipografía">
          <select
            value={theme.font_family ?? "system"}
            onChange={(e) => patch("font_family", e.target.value as NonNullable<Theme["font_family"]>)}
            style={selectStyle}
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Radio de bordes">
          <select
            value={theme.border_radius ?? "md"}
            onChange={(e) => patch("border_radius", e.target.value as NonNullable<Theme["border_radius"]>)}
            style={selectStyle}
          >
            {RADIUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="URL del logo (opcional)" full>
          <input
            type="url"
            placeholder="https://..."
            value={theme.logo_url ?? ""}
            onChange={(e) => patch("logo_url", e.target.value || undefined)}
            style={inputStyle}
          />
        </Field>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 13,
        fontWeight: 600,
        color: "#0f172a",
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};
const selectStyle: React.CSSProperties = inputStyle;
