// Configuración del cliente TanStack Query.
// Estrategia por defecto: staleTime 30s, gcTime 5min, retry 1.
// Realtime Supabase invalida queries relevantes (suscripción en cada screen).

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});