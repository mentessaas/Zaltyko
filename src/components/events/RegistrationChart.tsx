"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface RegistrationChartProps {
  data: {
    registrations: {
      total: number;
      pending: number;
      confirmed: number;
      cancelled: number;
      waitlisted: number;
    };
    capacity: {
      total: number | null;
      available: number | null;
      utilizationPercent: number | null;
    };
  };
  eventTitle?: string;
}

const COLORS = {
  confirmed: "#1FC7B6",
  pending: "#2B2E83",
  waitlisted: "#CBD5E1",
  cancelled: "#FF6B57",
  available: "#CBD5E1",
};

export function RegistrationChart({ data, eventTitle }: RegistrationChartProps) {
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");

  const pieData = [
    { name: "Confirmados", value: data.registrations.confirmed, fill: COLORS.confirmed },
    { name: "Pendientes", value: data.registrations.pending, fill: COLORS.pending },
    { name: "En lista de espera", value: data.registrations.waitlisted, fill: COLORS.waitlisted },
    { name: "Cancelados", value: data.registrations.cancelled, fill: COLORS.cancelled },
  ].filter((d) => d.value > 0);

  const barData = [
    { name: "Inscripciones", ...data.registrations },
    ...(data.capacity.total
      ? [{ name: "Capacidad", available: data.capacity.available, total: data.capacity.total }]
      : []),
  ];

  const totalRegistrations = data.registrations.total;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-zaltyko-navy">Inscripciones</CardTitle>
            <CardDescription>
              {eventTitle && `Inscripciones para ${eventTitle}`}
            </CardDescription>
          </div>

          <Tabs value={chartType} onValueChange={(v) => setChartType(v as "bar" | "pie")}>
            <TabsList>
              <TabsTrigger value="bar">Barras</TabsTrigger>
              <TabsTrigger value="pie">Circular</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-zaltyko-navy">{totalRegistrations}</p>
            <p className="text-xs text-zaltyko-text-secondary">Total</p>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-zaltyko-teal">
              {data.registrations.confirmed}
            </p>
            <p className="text-xs text-zaltyko-text-secondary">Confirmados</p>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-zaltyko-indigo">
              {data.registrations.pending}
            </p>
            <p className="text-xs text-zaltyko-text-secondary">Pendientes</p>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-bold text-zaltyko-coral">
              {data.registrations.waitlisted}
            </p>
            <p className="text-xs text-zaltyko-text-secondary">En espera</p>
          </div>
        </div>

        {/* Capacity Info */}
        {data.capacity.total && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Capacidad utilizada</span>
              <span className="font-medium">
                {data.capacity.utilizationPercent}%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-zaltyko-mist/35">
              <div
                className="h-full bg-zaltyko-teal transition-all"
                style={{ width: `${Math.min(100, data.capacity.utilizationPercent || 0)}%` }}
              />
            </div>
            <p className="text-xs text-zaltyko-text-secondary">
              {data.capacity.total - (data.capacity.available || 0)} de {data.capacity.total} lugares ocupados
              {data.capacity.available !== null && data.capacity.available > 0 && (
                <span className="ml-2 text-zaltyko-teal">
                  {data.capacity.available} disponibles
                </span>
              )}
            </p>
          </div>
        )}

        {/* Charts */}
        {chartType === "bar" ? (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis
                  dataKey="name"
                  type="category"
                  className="text-xs"
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="confirmed" stackId="a" fill={COLORS.confirmed} name="Confirmados" />
                <Bar dataKey="pending" stackId="a" fill={COLORS.pending} name="Pendientes" />
                <Bar dataKey="waitlisted" stackId="a" fill={COLORS.waitlisted} name="En espera" />
                <Bar dataKey="cancelled" stackId="a" fill={COLORS.cancelled} name="Cancelados" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Empty State */}
        {totalRegistrations === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-zaltyko-text-secondary">
            <div className="text-center">
              <p className="text-sm">No hay inscripciones todavía</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RegistrationChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}

interface RegistrationTrendChartProps {
  data: Array<{
    date: string;
    registrations: number;
    confirmations: number;
  }>;
}

export function RegistrationTrendChart({ data }: RegistrationTrendChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tendencia de Inscripciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-zaltyko-text-secondary">
            No hay datos suficientes para mostrar la tendencia
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tendencia de Inscripciones</CardTitle>
        <CardDescription>
          Evolución de inscripciones y confirmaciones en el tiempo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("es-ES", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelFormatter={(value) =>
                  new Date(value).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                }
              />
              <Bar
                dataKey="registrations"
                fill="#1FC7B6"
                name="Inscripciones"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="confirmations"
                fill="#2B2E83"
                name="Confirmaciones"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
