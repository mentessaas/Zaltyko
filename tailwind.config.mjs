import tailwindTypography from "@tailwindcss/typography";
import tailwindAnimate from "tailwindcss-animate";

/** @type {import("tailwindcss").Config} */
const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zaltyko: precisión en movimiento
        zaltyko: {
          navy: "#16243A",
          indigo: "#315B58",
          teal: "#146F68",
          coral: "#B84D42",
          white: "#F8F7F3",
          mist: "#DEDCD3",
          lime: "#D5E776",
          primary: {
            DEFAULT: "#146F68",
            dark: "#105752",
            light: "#4E978B",
            ultralight: "#E8F1EB",
          },
          // Acento histórico para visualizaciones que aún lo utilizan.
          electric: "#1FC7B6",
          accent: {
            DEFAULT: "#146F68",
            teal: "#146F68",
            coral: "#B84D42",
            amber: "#8C671D",
          },
          "primary-dark": "#105752",
          bg: {
            DEFAULT: "#F8F7F3",
            paper: "#FFFFFF",
            dark: "#16243A",
          },
          text: {
            main: "#16243A",
            secondary: "#53616B",
            light: "#68756F",
          },
          border: "#DEDCD3",
        },

        // Compatibilidad Shadcn
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
        primary: {
          DEFAULT: "hsl(var(--primary))",
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
        border: "hsl(var(--border))",
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
        display: ["var(--font-space-grotesk)", "ui-sans-serif", "system-ui"],
      },
      // Sistema de elevación de marca (Fase 2, 2026-07-14): nivel 0 = solo borde
      // zaltyko-mist (sin sombra); nivel 1 = shadow-soft (hover/activo); nivel 2 =
      // shadow-medium (overlays/modales). shadow-brand/indigo/lift/glow quedan como
      // acentos puntuales, no como base de reposo de ningún componente nuevo.
      boxShadow: {
        soft: "0 2px 8px rgba(15, 23, 42, 0.06)",
        medium: "0 8px 24px rgba(15, 23, 42, 0.08)",
        glass: "0 2px 8px rgba(15, 23, 42, 0.06)",
        glow: "0 0 0 3px rgba(20, 111, 104, 0.16)",
        // Sombras con tinte de marca (reemplazan las grises planas)
        brand: "0 8px 30px rgba(20, 111, 104, 0.12)",
        indigo: "0 8px 30px rgba(22, 36, 58, 0.12)",
        lift: "0 16px 40px -12px rgba(20, 111, 104, 0.24)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        // Sistema de radio de marca (Fase 2 del sistema de diseño, 2026-07-14):
        // 3 niveles con nombre en vez de valores arbitrarios sueltos por componente.
        control: "6px", // botones, inputs, chips
        card: "10px", // tarjetas, filas, paneles
        modal: "16px", // modales, sheets, overlays
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-glow":
          "linear-gradient(135deg, rgba(43, 46, 131, 0.16), rgba(31, 199, 182, 0.12))",
      },
    },
  },
  plugins: [tailwindAnimate, tailwindTypography],
};

export default config;
