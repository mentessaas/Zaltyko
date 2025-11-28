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
        // Zaltyko Premium Design System
        zaltyko: {
          primary: {
            DEFAULT: "#8B5CF6", // Violeta vibrante
            dark: "#7C3AED", // Violeta profundo
            light: "#A78BFA", // Violeta claro
            ultralight: "#F5F3FF", // Fondo muy claro
          },
          accent: {
            teal: "#14B8A6", // Teal para éxito/fresco
            coral: "#F43F5E", // Coral para alertas/acción
            amber: "#F59E0B", // Ámbar para warnings
          },
          bg: {
            DEFAULT: "#F8FAFC", // Slate-50 (más frío y limpio)
            paper: "#FFFFFF",
            dark: "#0F172A", // Slate-900
          },
          text: {
            main: "#1E293B", // Slate-800
            secondary: "#64748B", // Slate-500
            light: "#94A3B8", // Slate-400
          },
          border: "#E2E8F0", // Slate-200
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
        display: ["var(--font-outfit)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(0, 0, 0, 0.03)",
        medium: "0 4px 20px rgba(0, 0, 0, 0.06)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        glow: "0 0 20px rgba(139, 92, 246, 0.3)", // Glow violeta
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-glow": "conic-gradient(from 180deg at 50% 50%, #E0C6FF 0deg, #F5F3FF 180deg, #E0C6FF 360deg)",
      },
    },
  },
  plugins: [tailwindAnimate, tailwindTypography],
} satisfies Config;
