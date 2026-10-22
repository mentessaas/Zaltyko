"use client";

import { memo, useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface SparklineProps {
  /** Serie de valores en orden cronológico (más antiguo primero). */
  data: number[];
  /** Color del trazo (hex). */
  color?: string;
  height?: number;
}

/**
 * Mini-gráfico de tendencia (sin ejes ni tooltip) para embeber dentro de las
 * tarjetas KPI. Recibe datos reales; si hay menos de 2 puntos no renderiza nada.
 */
function SparklineImpl({ data, color = "#00796B", height = 34 }: SparklineProps) {
  const gradientId = useId();

  if (!data || data.length < 2) return null;

  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const Sparkline = memo(SparklineImpl);
export default Sparkline;
