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
        // Zaltyko Brand Book v1
        zaltyko: {
          navy: "#0F172A",
          indigo: "#2B2E83",
          teal: "#00796B",
          coral: "#FF6B57",
          white: "#F8FAFC",
          // Superficie cálida de paneles, modales y tarjetas. Estaba en uso en
          // toda la app (incl. el fondo de los modales) pero no definida: sin
          // token Tailwind no generaba nada y los paneles quedaban transparentes.
          "warm-white": "#FDFCFA",
          mist: "#CBD5E1",
          // Grises de texto/superficie alineados con la escala slate del brand.
          neutral: {
            DEFAULT: "#64748B",
            dark: "#334155",
            light: "#94A3B8",
          },
          // Rojo semántico para estados de error/destructivo.
          danger: "#DC2626",
          primary: {
            DEFAULT: "#00796B", // Deep Teal — color de acción/marca (botones, links)
            dark: "#00695C",
            light: "#14B8A6",
            ultralight: "#E6FFFC",
          },
          // Electric Teal — acento vibrante (glows, highlights, charts, hovers)
          electric: "#1FC7B6",
          accent: {
            DEFAULT: "#2B2E83",
            // Variante clara del indigo, legible sobre fondo claro (titulares).
            light: "#4A4EAF",
            teal: "#00796B",
            coral: "#FF6B57",
            amber: "#FF6B57",
          },
          "primary-dark": "#00695C",
          bg: {
            DEFAULT: "#F8FAFC",
            paper: "#FFFFFF",
            light: "#F1F5F9",
            dark: "#0F172A",
          },
          text: {
            main: "#0F172A",
            secondary: "#475569",
            light: "#64748B",
          },
          border: "#CBD5E1",
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
        // Alias de compatibilidad: 38 archivos (incluido el <Button> por defecto)
        // usan `hover:bg-primary-dark`, que no resolvía a nada -> el CTA principal
        // no tenía ningún estado hover. Pendiente unificar en `zaltyko-primary-dark`.
        "primary-dark": "#00695C",
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
        glow: "0 0 0 3px rgba(31, 199, 182, 0.15)",
        // Sombras con tinte de marca (reemplazan las grises planas)
        brand: "0 8px 30px rgba(0, 121, 107, 0.12)",
        indigo: "0 8px 30px rgba(43, 46, 131, 0.12)",
        lift: "0 16px 40px -12px rgba(0, 121, 107, 0.25)",
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
