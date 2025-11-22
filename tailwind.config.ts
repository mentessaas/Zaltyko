import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";
import tailwindTypography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zaltyko Design System 1.0 - Tokens oficiales
        zaltyko: {
          primary: {
            DEFAULT: "#B690F0", // Morado principal
            dark: "#8A63C3", // Morado oscuro
            light: "#EDEAFE", // Lavanda claro
          },
          bg: {
            DEFAULT: "#FAF9FF", // Fondo principal
            light: "#FFFFFF", // Fondo claro/blanco
          },
          text: {
            main: "#1C1C1E", // Texto principal
            secondary: "#6D6D6D", // Texto secundario
          },
          border: "#E6E6EB", // Borde
          success: "#4CAF79", // Verde éxito
          danger: "#E75C5A", // Rojo peligro
          warning: "#F6BC50", // Amarillo advertencia
          info: "#5E8EEC", // Azul información
        },
        // Tokens del Design System como colores directos (para uso directo)
        "primary-ds": {
          DEFAULT: "#B690F0",
          dark: "#8A63C3",
          light: "#EDEAFE",
        },
        "bg-ds": {
          DEFAULT: "#FAF9FF",
          light: "#FFFFFF",
        },
        "text-ds": {
          main: "#1C1C1E",
          secondary: "#6D6D6D",
        },
        "border-ds": "#E6E6EB",
        "success-ds": "#4CAF79",
        "danger-ds": "#E75C5A",
        "warning-ds": "#F6BC50",
        "info-ds": "#5E8EEC",
        // Mantener compatibilidad con sistema existente
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Primary usa los tokens del Design System pero mantiene compatibilidad HSL
        primary: {
          DEFAULT: "#B690F0", // Design System primary
          dark: "#8A63C3",
          light: "#EDEAFE",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Border usa el token del Design System
        border: "#E6E6EB", // Design System border
        "border-hsl": "hsl(var(--border))", // Para compatibilidad
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-poppins)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.06)",
        medium: "0 4px 12px rgba(0,0,0,0.08)",
        card: "0 4px 20px rgba(13, 71, 161, 0.1)",
        button: "0 2px 8px rgba(66, 165, 245, 0.3)",
      },
      borderRadius: {
        base: "12px",
        large: "16px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
      },
    },
  },
  plugins: [tailwindAnimate, tailwindTypography],
} satisfies Config;
