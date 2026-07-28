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
      // ESCALA ÚNICA DE ELEVACIÓN.
      // Convivían 7 niveles sin relación entre sí (shadow-sm/md/lg/xl/2xl grises
      // de Tailwind + soft/medium de marca), así que dos tarjetas equivalentes
      // levitaban distinto. Se redefinen los nombres genéricos para que compartan
      // la misma rampa, con tinte navy en lugar de gris plano: da profundidad sin
      // ensuciar el color de fondo.
      boxShadow: {
        // Rampa: reposo -> hover -> flotante -> overlay
        sm: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.05)",
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.05)",
        md: "0 2px 4px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.07)",
        medium: "0 2px 4px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.07)",
        lg: "0 4px 8px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.09)",
        xl: "0 8px 16px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.11)",
        "2xl": "0 12px 24px rgba(15, 23, 42, 0.08), 0 24px 56px rgba(15, 23, 42, 0.13)",
        glass: "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.05)",
        // Focus/acento: anillo teal en vez de sombra difusa.
        glow: "0 0 0 3px rgba(31, 199, 182, 0.18)",
        brand: "0 8px 24px rgba(0, 121, 107, 0.14)",
        indigo: "0 8px 24px rgba(43, 46, 131, 0.14)",
        lift: "0 16px 40px -12px rgba(0, 121, 107, 0.28)",
      },
      // ESCALA ÚNICA DE RADIO.
      // El problema no era que faltara un sistema, sino que convivían dos: los
      // nombres semánticos (control/card/modal, 70 usos) y los genéricos de
      // Tailwind (rounded-md/lg/xl/2xl, ~1.800 usos) con valores muy grandes
      // (--radius valía 18px, así que rounded-md daba 16px y todo se veía
      // hinchado). En vez de reescribir 1.800 clases, se redefine a qué resuelve
      // cada nombre para que TODAS caigan sobre la misma escala 6/8/10/12/16/20.
      borderRadius: {
        sm: "calc(var(--radius) - 4px)", // 6px  · chips, badges
        md: "calc(var(--radius) - 2px)", // 8px  · inputs, botones
        lg: "var(--radius)", //            10px · tarjetas, filas
        xl: "calc(var(--radius) + 2px)", // 12px · paneles
        "2xl": "calc(var(--radius) + 6px)", // 16px · modales, secciones
        "3xl": "calc(var(--radius) + 10px)", // 20px · superficies hero
        // Alias semánticos: mismo valor que su equivalente de la escala.
        control: "calc(var(--radius) - 4px)",
        card: "var(--radius)",
        modal: "calc(var(--radius) + 6px)",
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
