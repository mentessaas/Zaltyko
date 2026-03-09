"use client";

import { cn } from "@/lib/utils";

interface ChartData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: ChartData[];
  height?: number;
  showValues?: boolean;
  className?: string;
}

interface LineChartProps {
  data: ChartData[];
  height?: number;
  showArea?: boolean;
  className?: string;
}

interface DonutChartProps {
  data: ChartData[];
  size?: number;
  className?: string;
}

const defaultColors = [
  "#8B5CF6", // violet
  "#14B8A6", // teal
  "#F59E0B", // amber
  "#EF4444", // red
  "#3B82F6", // blue
  "#EC4899", // pink
  "#10B981", // emerald
  "#6366F1", // indigo
];

export function BarChart({ data, height = 200, showValues = true, className }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * 100;
          const color = item.color || defaultColors[index % defaultColors.length];

          return (
            <div
              key={item.label}
              className="group relative flex-1 flex flex-col items-center justify-end"
            >
              {/* Tooltip */}
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                {item.value}
              </div>

              {/* Bar */}
              <div
                className="w-full rounded-t-lg transition-all duration-300 group-hover:opacity-80"
                style={{
                  height: `${barHeight}%`,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}CC 100%)`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex gap-2">
        {data.map((item, index) => (
          <div
            key={item.label}
            className="flex-1 flex flex-col items-center gap-1"
          >
            {showValues && (
              <span className="text-xs font-medium text-zaltyko-text-main">
                {item.value}
              </span>
            )}
            <span className="text-xs text-zaltyko-text-secondary truncate max-w-full">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ data, height = 200, showArea = true, className }: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: height - (d.value / maxValue) * (height - 40),
    value: d.value,
    label: d.label,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x / 100) * 280} ${p.y}`)
    .join(" ");

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <svg
        viewBox="0 0 280 200"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ height }}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1="0"
            y1={tick * (height - 20)}
            x2="280"
            y2={tick * (height - 20)}
            stroke="#E2E8F0"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Area */}
        {showArea && (
          <path
            d={`${pathD} L 280 ${height - 20} L 0 ${height - 20} Z`}
            fill="url(#areaGradient)"
            opacity="0.2"
          />
        )}

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={(point.x / 100) * 280}
              cy={point.y}
              r="6"
              fill="white"
              stroke="#8B5CF6"
              strokeWidth="3"
            />
            <title>{`${point.label}: ${point.value}`}</title>
          </g>
        ))}

        {/* Gradient definition */}
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Labels */}
      <div className="flex justify-between mt-2">
        {data.map((item, i) => (
          <span
            key={i}
            className="text-xs text-zaltyko-text-secondary"
            style={{ width: `${100 / data.length}%` }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ data, size = 120, className }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = -90;

  const segments = data.map((item, index) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    return {
      path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`,
      color: item.color || defaultColors[index % defaultColors.length],
      percentage,
      label: item.label,
      value: item.value,
    };
  });

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg
        viewBox="0 0 100 100"
        className="flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {segments.map((segment, i) => (
          <path
            key={i}
            d={segment.path}
            fill={segment.color}
            className="transition-opacity hover:opacity-80"
          >
            <title>{`${segment.label}: ${segment.value} (${segment.percentage.toFixed(1)}%)`}</title>
          </path>
        ))}
        <circle cx="50" cy="50" r="25" fill="white" />
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-1">
        {data.map((item, i) => {
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color || defaultColors[i % defaultColors.length] }}
              />
              <span className="text-xs text-zaltyko-text-secondary">
                {item.label}: {item.value} ({percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MiniChart({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: 30 - ((v - min) / range) * 25,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 35" preserveAspectRatio="none" className={cn("w-full h-8", className)}>
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-violet-500"
      />
    </svg>
  );
}
