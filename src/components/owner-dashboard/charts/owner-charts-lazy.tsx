"use client";

import dynamic from "next/dynamic";

import { OwnerChartSkeleton } from "./chart-parts";

/**
 * Carga diferida de las gráficas: su código llega en trozos aparte, después
 * del resto del panel, y mientras tanto se ve un esqueleto con su forma.
 */
export const LazyAttendanceWeeksChart = dynamic(
  () => import("./AttendanceWeeksChart").then((loaded) => loaded.AttendanceWeeksChart),
  {
    ssr: false,
    loading: () => <OwnerChartSkeleton variant="columns" label="Cargando la asistencia por semana…" />,
  }
);

export const LazyClassOccupancyChart = dynamic(
  () => import("./ClassOccupancyChart").then((loaded) => loaded.ClassOccupancyChart),
  {
    ssr: false,
    loading: () => <OwnerChartSkeleton variant="rows" label="Cargando la ocupación por clase…" />,
  }
);

export const LazyMonthlyFeesChart = dynamic(
  () => import("./MonthlyFeesChart").then((loaded) => loaded.MonthlyFeesChart),
  {
    ssr: false,
    loading: () => <OwnerChartSkeleton variant="bar" label="Cargando las cuotas del mes…" />,
  }
);

export const LazyAthleteSignupsChart = dynamic(
  () => import("./AthleteSignupsChart").then((loaded) => loaded.AthleteSignupsChart),
  {
    ssr: false,
    loading: () => <OwnerChartSkeleton variant="columns" label="Cargando las altas de gimnastas…" />,
  }
);
