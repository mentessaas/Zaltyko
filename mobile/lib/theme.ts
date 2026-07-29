// Tokens de diseño Zaltyko. Replicar manualmente evita acoplar la app
// móvil a tailwind.config.ts; si cambian los colores del web, actualizar
// aquí también. Mantener sincronía con `tailwind.config.ts`.

export const colors = {
  // Backgrounds
  bg: '#0F172A', // slate-900 — splash y fondo oscuro
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC', // slate-50
  surfaceDark: '#1E293B', // slate-800

  // Text
  text: '#0F172A',
  textMuted: '#64748B', // slate-500
  textInverse: '#FFFFFF',

  // Brand
  primary: '#4F46E5', // indigo-600
  primaryHover: '#4338CA', // indigo-700
  primaryFg: '#FFFFFF',
  primarySoft: 'rgba(99, 102, 241, 0.16)',

  // Semantic
  success: '#16A34A', // green-600
  warning: '#F59E0B', // amber-500
  danger: '#DC2626', // red-600
  info: '#0EA5E9', // sky-500

  // Border
  border: '#E2E8F0', // slate-200
  borderDark: '#334155', // slate-700

  // Tab bar
  tabActive: '#4F46E5',
  tabInactive: '#94A3B8', // slate-400
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
} as const;

// Elevación para que Card/Input/Button se despeguen del fondo oscuro en
// vez de leerse como bloques planos. shadow* para iOS, elevation para Android.
export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 9,
  },
} as const;

export type ColorKey = keyof typeof colors;