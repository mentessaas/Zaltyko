import tailwindTypography from "@tailwindcss/typography";
import tailwindAnimate from "tailwindcss-animate";

// Escalas completas del mundo «Magnesio sobre tapiz». Con ellas se reasignan
// las familias de Tailwind que usan ~210 pantallas heredadas (Alias Rule a
// nivel de tema): azules/verdes/violetas → tapiz, rojos/ámbares → señal,
// grises → rampa. Así el SaaS entero queda en dos tintas sin tocar cada archivo.
const MAT_SCALE = {
  50: "#F0F3FC", 100: "#E8EDFB", 200: "#CED9F6", 300: "#A9BEF0", 400: "#7C99E6",
  500: "#4A6BD3", 600: "#2F51BE", 700: "#1E3FA8", 800: "#14307F", 900: "#0F2463", 950: "#0B1430",
};
const SIGNAL_SCALE = {
  50: "#FDF3F0", 100: "#FDECE7", 200: "#FAD3C9", 300: "#F5AE9D", 400: "#EE806A",
  500: "#E5482A", 600: "#C93C20", 700: "#B8331A", 800: "#962A16", 900: "#7A2414", 950: "#431109",
};
const RAMP_SCALE = {
  50: "#F4F6F2", 100: "#E9ECE6", 200: "#D5DAE3", 300: "#B4BCCB", 400: "#8A93A8",
  500: "#5C6782", 600: "#3E4A66", 700: "#27314C", 800: "#162038", 900: "#0B1430", 950: "#070D20",
};

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
        // «Magnesio sobre tapiz» (2026-11-08). El mundo nuevo vive en `mat`,
        // `chalk`, `tape`, `signal` y la rampa `ramp`. Los nombres `zaltyko-*`
        // se conservan como alias para que las ~800 pantallas heredan el mundo
        // sin reescribirse una a una: teal → azul tapiz (acción), navy → noche,
        // coral → señal, mist → línea de magnesio.
        // Familias de Tailwind reasignadas (ver MAT_SCALE y compañía arriba).
        ...Object.fromEntries(
          ["teal", "emerald", "green", "cyan", "sky", "blue", "indigo", "violet", "purple", "lime"].map((k) => [k, MAT_SCALE])
        ),
        ...Object.fromEntries(
          ["amber", "yellow", "orange", "red", "rose", "pink", "fuchsia"].map((k) => [k, SIGNAL_SCALE])
        ),
        ...Object.fromEntries(["gray", "slate", "zinc", "neutral", "stone"].map((k) => [k, RAMP_SCALE])),
        mat: {
          DEFAULT: "#1E3FA8", // tapiz de competición: acción y campos de marca
          deep: "#14307F", // zona de seguridad del tapiz: navegación, bandas
          night: "#0B1430", // tinta
          lane: "#8FB4FF", // azul claro sobre tapiz (texto secundario en azul)
          light: "#5B7BE0", // tono medio: series y estados en curso
          wash: "#E8EDFB", // tinte suave para filas activas
        },
        chalk: {
          DEFAULT: "#F4F6F2", // magnesio: fondo de trabajo
          dust: "#E9ECE6",
          line: "#D5DAE3",
        },
        tape: "#FFFFFF", // cinta de límite
        signal: {
          DEFAULT: "#E5482A", // alertas y deudas, nunca decoración
          ink: "#B8331A", // texto de alerta sobre claro (≥4.5:1)
          light: "#FF8A73", // texto de alerta sobre noche (modo oscuro)
          wash: "#FDECE7",
        },
        // Rampa de neutros escalonada (donación de la ficha de exposición):
        // únicos grises permitidos, con un punto de azul.
        ramp: {
          50: "#F4F6F2",
          100: "#E9ECE6",
          200: "#D5DAE3",
          300: "#B4BCCB",
          400: "#8A93A8",
          500: "#5C6782",
          600: "#3E4A66",
          700: "#27314C",
          800: "#162038",
          900: "#0B1430",
        },
        zaltyko: {
          navy: "#0B1430",
          indigo: "#14307F",
          teal: "#1E3FA8",
          coral: "#C2391E", // alias de texto: coral oscuro, 5.4:1 sobre blanco
          white: "#F4F6F2",
          // Usado en ~23 pantallas heredadas y nunca definido: ahora es polvo de magnesio.
          "warm-white": "#E9ECE6",
          mist: "#D5DAE3",
          primary: {
            DEFAULT: "#1E3FA8",
            dark: "#14307F",
            light: "#5B7BE0",
            ultralight: "#E8EDFB",
          },
          electric: "#8FB4FF",
          accent: {
            DEFAULT: "#14307F",
            teal: "#1E3FA8",
            coral: "#C2391E",
            amber: "#C2391E",
          },
          "primary-dark": "#14307F",
          bg: {
            DEFAULT: "#F4F6F2",
            paper: "#FFFFFF",
            dark: "#0B1430",
          },
          text: {
            main: "#0B1430",
            secondary: "#3E4A66",
            light: "#5C6782",
          },
          border: "#D5DAE3",
        },

        // Panel del club (`/owner`): sus tokens `z-*` (introducidos el 2026-11-07
        // con violeta de marca) se redirigen al mundo «Magnesio sobre tapiz» por
        // decisión del 2026-11-09: una sola identidad en toda la plataforma.
        // Lienzo → magnesio, tinta → noche, marca → azul tapiz, atención → señal.
        // Las disciplinas se distinguen por tono (tapiz, pizarra, noche), no por
        // tinte; cada 600 cumple ≥4,5:1 sobre su 50.
        z: {
          canvas: "#F4F6F2",
          line: "#D5DAE3",
          ink: "#0B1430",
          soft: "#5C6782",
          brand: { 50: "#E8EDFB", 100: "#CED9F6", 500: "#1E3FA8", 600: "#1E3FA8", 700: "#14307F" },
          chalk: { 50: "#FDECE7", 500: "#E5482A", 600: "#B8331A" },
          art: { 50: "#E8EDFB", 600: "#1E3FA8" },
          rit: { 50: "#E9ECE6", 600: "#3E4A66" },
          comp: { 50: "#F4F6F2", 600: "#0B1430" },
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
      // Tapiz: superficies planas apoyadas en el suelo. Sombras cortas, con
      // desplazamiento y tinte azul noche; nada de halos.
      boxShadow: {
        // Sombras por defecto de Tailwind redefinidas (Flat Mat Rule a nivel de
        // tema): las pantallas heredadas que piden shadow-md/lg/xl reciben la
        // misma sombra corta de contacto que el resto del mundo.
        sm: "0 1px 2px rgba(11, 20, 48, 0.06)",
        DEFAULT: "0 1px 2px rgba(11, 20, 48, 0.06), 0 2px 6px -2px rgba(11, 20, 48, 0.08)",
        md: "0 1px 2px rgba(11, 20, 48, 0.06), 0 2px 6px -2px rgba(11, 20, 48, 0.08)",
        lg: "0 1px 2px rgba(11, 20, 48, 0.08), 0 4px 10px -6px rgba(11, 20, 48, 0.2)",
        xl: "0 6px 20px -6px rgba(11, 20, 48, 0.18)",
        "2xl": "0 6px 20px -6px rgba(11, 20, 48, 0.18)",
        soft: "0 1px 2px rgba(11, 20, 48, 0.06), 0 2px 6px -2px rgba(11, 20, 48, 0.08)",
        medium: "0 6px 20px -6px rgba(11, 20, 48, 0.18)",
        glass: "0 1px 2px rgba(11, 20, 48, 0.06)",
        // Alias heredados: misma sombra corta de contacto que `soft`, sin brillos.
        glow: "0 0 0 3px rgba(30, 63, 168, 0.18)",
        brand: "0 1px 2px rgba(11, 20, 48, 0.08), 0 4px 10px -6px rgba(11, 20, 48, 0.2)",
        indigo: "0 1px 2px rgba(11, 20, 48, 0.08), 0 4px 10px -6px rgba(11, 20, 48, 0.2)",
        lift: "0 1px 2px rgba(11, 20, 48, 0.08), 0 6px 14px -8px rgba(11, 20, 48, 0.28)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Esquinas de tapiz y cinta: cortas. Los valores grandes heredados se
        // comprimen para que todo el producto pierda la "píldora blanda".
        xl: "0.75rem",
        "2xl": "0.875rem",
        "3xl": "1rem",
        // Sistema de radio de marca (Fase 2 del sistema de diseño, 2026-07-14):
        // 3 niveles con nombre en vez de valores arbitrarios sueltos por componente.
        control: "6px", // botones, inputs, chips
        card: "10px", // tarjetas, filas, paneles
        modal: "16px", // modales, sheets, overlays
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        // Alias heredado: superficie plana de magnesio, sin degradado.
        "hero-glow": "linear-gradient(#E9ECE6, #E9ECE6)",
      },
      keyframes: {
        // Un palote de magnesio se dibuja de arriba abajo.
        "chalk-stroke": {
          from: { strokeDashoffset: "var(--stroke-len, 40)" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "chalk-stroke": "chalk-stroke 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [tailwindAnimate, tailwindTypography],
};

export default config;
