"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

/**
 * Sistema de gráficos de marca sobre recharts (ya en dependencias).
 * Paleta Brand Book v1 vía tokens CSS; tooltips y ejes consistentes
 * en claro y oscuro. La animación de entrada de recharts (isAnimationActive)
 * dibuja las series al montar y al cambiar de datos.
 */

export const CHART_COLORS = {
  teal: "#00796B",
  electric: "#1FC7B6",
  indigo: "#2B2E83",
  coral: "#FF6B57",
  slate: "#94A3B8",
} as const;

export type ChartPoint = Record<string, string | number>;

const axisProps = {
  stroke: "hsl(215 20.2% 65.1%)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ stroke: CHART_COLORS.electric, strokeOpacity: 0.3 }}
      contentStyle={{
        backgroundColor: "hsl(222 47% 11%)",
        border: "1px solid hsl(217.2 32.6% 17.5%)",
        borderRadius: 10,
        color: "#F8FAFC",
        fontSize: 12,
        padding: "8px 12px",
      }}
      labelStyle={{ color: "hsl(210 40% 98%)", fontWeight: 600, marginBottom: 4 }}
      itemStyle={{ padding: 0 }}
    />
  );
}

type Series = {
  key: string;
  label: string;
  color?: string;
};

type BrandLineChartProps = {
  data: ChartPoint[];
  xKey: string;
  series: Series[];
  className?: string;
  /** Altura en px del contenedor responsive. */
  height?: number;
};

/** Gráfico de líneas con área suave en la primera serie. */
export function BrandLineChart({
  data,
  xKey,
  series,
  className,
  height = 260,
}: BrandLineChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20.2% 65.1%)" strokeOpacity={0.25} vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          {ChartTooltip()}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? (i === 0 ? CHART_COLORS.teal : CHART_COLORS.indigo)}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type BrandBarChartProps = BrandLineChartProps & {
  /** Resalta la barra con valor máximo (Electric Teal). */
  highlightMax?: boolean;
};

/** Gráfico de barras verticales. */
export function BrandBarChart({
  data,
  xKey,
  series,
  className,
  height = 260,
  highlightMax = false,
}: BrandBarChartProps) {
  const single = series.length === 1;
  let maxValue = -Infinity;
  let maxKey: string | null = null;
  if (single) {
    for (const d of data) {
      const v = Number(d[series[0].key]);
      if (Number.isFinite(v) && v > maxValue) {
        maxValue = v;
        maxKey = String(d[xKey]);
      }
    }
  }

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20.2% 65.1%)" strokeOpacity={0.25} vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          {ChartTooltip()}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? (i === 0 ? CHART_COLORS.teal : CHART_COLORS.indigo)}
              radius={[6, 6, 0, 0]}
              maxBarSize={42}
              isAnimationActive
              animationDuration={500}
              animationEasing="ease-out"
            >
              {single &&
                highlightMax &&
                data.map((d) => (
                  <Cell
                    key={String(d[xKey])}
                    fill={String(d[xKey]) === maxKey ? CHART_COLORS.electric : CHART_COLORS.teal}
                  />
                ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type BrandAreaChartProps = BrandLineChartProps & {
  /** Color del relleno de área (primera serie). */
  areaColor?: string;
};

/** Gráfico de área para evoluciones (asistencia, ritmo de la academia). */
export function BrandAreaChart({
  data,
  xKey,
  series,
  className,
  height = 260,
  areaColor = CHART_COLORS.electric,
}: BrandAreaChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="zkAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={areaColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={areaColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20.2% 65.1%)" strokeOpacity={0.25} vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          {ChartTooltip()}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS.teal}
              strokeWidth={2.2}
              fill={i === 0 ? "url(#zkAreaFill)" : "transparent"}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mini-sparkline para stat cards y filas de tabla. */
export function Sparkline({
  data,
  dataKey,
  color = CHART_COLORS.electric,
  className,
  height = 36,
}: {
  data: ChartPoint[];
  dataKey: string;
  color?: string;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
