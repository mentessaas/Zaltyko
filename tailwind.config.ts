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
        // Zaltyko Brand Book v1
        zaltyko: {
          navy: "#0F172A",
          indigo: "#2B2E83",
          teal: "#1FC7B6",
          coral: "#FF6B57",
          white: "#F8FAFC",
          mist: "#CBD5E1",
          primary: {
            DEFAULT: "#1FC7B6",
            dark: "#18A89A",
            light: "#5CE0D4",
            ultralight: "#E6FFFC",
          },
          accent: {
            DEFAULT: "#2B2E83",
            teal: "#1FC7B6",
            coral: "#FF6B57",
            amber: "#FF6B57",
          },
          "primary-dark": "#18A89A", // Alias for brand primary dark
          bg: {
            DEFAULT: "#F8FAFC",
            paper: "#FFFFFF",
            dark: "#0F172A",
          },
          text: {
            main: "#0F172A",
            secondary: "#475569",
            light: "#94A3B8",
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
      boxShadow: {
        soft: "0 2px 8px rgba(15, 23, 42, 0.06)",
        medium: "0 8px 24px rgba(15, 23, 42, 0.08)",
        glass: "0 2px 8px rgba(15, 23, 42, 0.06)",
        glow: "0 0 0 3px rgba(31, 199, 182, 0.15)",
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
        "hero-glow": "linear-gradient(135deg, rgba(43, 46, 131, 0.16), rgba(31, 199, 182, 0.12))",
      },
    },
  },
  plugins: [tailwindAnimate, tailwindTypography],
} satisfies Config;
