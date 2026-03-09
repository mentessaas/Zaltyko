"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Calendar, Download, FileText, Loader2, Users, DollarSign, Activity, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatsCard } from "@/components/ui/stats-card";
import { cn } from "@/lib/utils";

// Theme colors
const COLORS = {
  violet: "#8B5CF6",
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
  blue: "#3B82F6",
  cyan: "#06B6D4",
  indigo: "#6366F1",
};

const CHART_COLORS = [COLORS.violet, COLORS.emerald, COLORS.amber, COLORS.rose, COLORS.blue, COLORS.cyan];

// Types
interface AnalyticsData {
  // Stats
  totalAthletes: number;
  monthlyRevenue: number;
  averageAttendance: number;
  classesThisMonth: number;
  // Trends
  athletesTrend: number;
  revenueTrend: number;
  attendanceTrend: number;
  classesTrend: number;
  // Charts data
  athletesEvolution: { month: string; athletes: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  athletesByLevel: { name: string; value: number }[];
  dailyAttendance: { day: string; present: number; absent: number }[];
  topClasses: { name: string; students: number }[];
  retentionChurn: { month: string; retained: number; churned: number; newAthletes: number }[];
}

interface Filters {
  dateRange: string;
  classId: string;
  coachId: string;
}

// Skeleton components
function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-slate-100 rounded-lg"
      style={{ height }}
    />
  );
}

function StatsCardSkeleton() {
  return (
    <div className="animate-pulse bg-slate-100 rounded-2xl h-32" />
  );
}

// Custom Tooltip
function CustomTooltip({ active, payload, label, formatter }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
        <p className="font-medium text-slate-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {formatter ? formatter(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// Currency formatter
const formatCurrency = (value: number) => `${value.toFixed(2)} €`;
const formatNumber = (value: number) => value.toLocaleString();

export function AnalyticsWidgets({ academyId }: { academyId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    dateRange: "12m",
    classId: "all",
    coachId: "all",
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        dateRange: filters.dateRange,
        classId: filters.classId,
        coachId: filters.coachId,
      });

      const response = await fetch(`/api/dashboard/${academyId}/analytics/full?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al cargar datos");
      }

      setData(result.data);
    } catch (err: any) {
      setError(err.message || "Error al cargar datos de analítica");
      // Generate mock data for demo
      setData(generateMockData());
    } finally {
      setIsLoading(false);
    }
  }, [academyId, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCSV = () => {
    if (!data) return;

    const csvContent = [
      "Metric,Value",
      `Total Athletes,${data.totalAthletes}`,
      `Monthly Revenue,${data.monthlyRevenue}`,
      `Average Attendance,${data.averageAttendance}%`,
      `Classes This Month,${data.classesThisMonth}`,
      "",
      "Monthly Revenue",
      "Month,Revenue",
      ...data.revenueByMonth.map((r) => `${r.month},${r.revenue}`),
      "",
      "Athletes by Level",
      "Level,Count",
      ...data.athletesByLevel.map((a) => `${a.name},${a.value}`),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    // In a real app, this would generate a PDF
    alert("La exportación a PDF se implementaría con una librería como jsPDF o react-pdf");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Filters and Export */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select
            value={filters.dateRange}
            onValueChange={(value) => setFilters((f) => ({ ...f, dateRange: value }))}
          >
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Rango" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.classId}
            onValueChange={(value) => setFilters((f) => ({ ...f, classId: value }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Clase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las clases</SelectItem>
              <SelectItem value="class1">Karate Principiantes</SelectItem>
              <SelectItem value="class2">Karate Avanzados</SelectItem>
              <SelectItem value="class3">Jiu Jitsu</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.coachId}
            onValueChange={(value) => setFilters((f) => ({ ...f, coachId: value }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Entrenador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="coach1">Juan Pérez</SelectItem>
              <SelectItem value="coach2">María García</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Atletas Activos"
          value={formatNumber(data.totalAthletes)}
          subtitle="Total registrados"
          icon={Users}
          trend={{ value: data.athletesTrend, label: "vs mes anterior" }}
          variant="default"
        />
        <StatsCard
          title="Ingresos del Mes"
          value={formatCurrency(data.monthlyRevenue)}
          subtitle="Facturación"
          icon={DollarSign}
          trend={{ value: data.revenueTrend, label: "vs mes anterior" }}
          variant="success"
        />
        <StatsCard
          title="Asistencia Promedio"
          value={`${data.averageAttendance.toFixed(1)}%`}
          subtitle="Últimos 30 días"
          icon={Activity}
          trend={{ value: data.attendanceTrend, label: "vs mes anterior" }}
          variant="warning"
        />
        <StatsCard
          title="Clases Este Mes"
          value={data.classesThisMonth}
          subtitle="Impartidas"
          icon={GraduationCap}
          trend={{ value: data.classesTrend, label: "vs mes anterior" }}
          variant="info"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolution of Athletes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evolución de Atletas</CardTitle>
            <CardDescription>Últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.athletesEvolution}>
                <defs>
                  <linearGradient id="athletesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748B" />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="athletes"
                  stroke={COLORS.violet}
                  strokeWidth={2}
                  fill="url(#athletesGradient)"
                  name="Atletas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ingresos por Mes</CardTitle>
            <CardDescription>Facturación mensual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748B" tickFormatter={(v) => `${v}€`} />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                <Bar dataKey="revenue" fill={COLORS.emerald} radius={[4, 4, 0, 0]} name="Ingresos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Athletes by Level */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribución por Nivel</CardTitle>
            <CardDescription>Atletas por nivel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.athletesByLevel}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {data.athletesByLevel.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Attendance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Asistencia Diaria</CardTitle>
            <CardDescription>Presentes vs Ausentes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.dailyAttendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748B" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="present"
                  stroke={COLORS.emerald}
                  strokeWidth={2}
                  dot={{ fill: COLORS.emerald, r: 4 }}
                  name="Presentes"
                />
                <Line
                  type="monotone"
                  dataKey="absent"
                  stroke={COLORS.rose}
                  strokeWidth={2}
                  dot={{ fill: COLORS.rose, r: 4 }}
                  name="Ausentes"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Classes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clases Populares</CardTitle>
            <CardDescription>Top 5 clases</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.topClasses} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  stroke="#64748B"
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="students" fill={COLORS.indigo} radius={[0, 4, 4, 0]} name="Estudiantes" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Retention/Churn Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Retention y Churn</CardTitle>
          <CardDescription>Atletas retenidos, perdidos y nuevos</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.retentionChurn}>
              <defs>
                <linearGradient id="retainedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="churnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.rose} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.rose} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
              <YAxis tick={{ fontSize: 12 }} stroke="#64748B" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="retained"
                stroke={COLORS.emerald}
                strokeWidth={2}
                fill="url(#retainedGradient)"
                name="Retenidos"
              />
              <Area
                type="monotone"
                dataKey="churned"
                stroke={COLORS.rose}
                strokeWidth={2}
                fill="url(#churnGradient)"
                name="Perdidos"
              />
              <Area
                type="monotone"
                dataKey="newAthletes"
                stroke={COLORS.violet}
                strokeWidth={2}
                fill={COLORS.violet}
                fillOpacity={0.2}
                name="Nuevos"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Generate mock data for demo
function generateMockData(): AnalyticsData {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return {
    totalAthletes: 156,
    monthlyRevenue: 12450.0,
    averageAttendance: 87.5,
    classesThisMonth: 48,
    athletesTrend: 5.2,
    revenueTrend: 12.3,
    attendanceTrend: -2.1,
    classesTrend: 8.0,
    athletesEvolution: months.map((month, i) => ({
      month,
      athletes: 100 + Math.floor(Math.random() * 30) + i * 5,
    })),
    revenueByMonth: months.map((month, i) => ({
      month,
      revenue: 8000 + Math.floor(Math.random() * 3000) + i * 400,
    })),
    athletesByLevel: [
      { name: "Principiante", value: 45 },
      { name: "Intermedio", value: 62 },
      { name: "Avanzado", value: 35 },
      { name: "Experto", value: 14 },
    ],
    dailyAttendance: days.map((day) => ({
      day,
      present: 20 + Math.floor(Math.random() * 15),
      absent: 3 + Math.floor(Math.random() * 8),
    })),
    topClasses: [
      { name: "Karate Kids", students: 32 },
      { name: "Karate Adulto", students: 28 },
      { name: "Jiu Jitsu", students: 24 },
      { name: "Krav Magá", students: 18 },
      { name: "Boxeo", students: 15 },
    ],
    retentionChurn: months.slice(-6).map((month, i) => ({
      month,
      retained: 120 + Math.floor(Math.random() * 20),
      churned: 2 + Math.floor(Math.random() * 8),
      newAthletes: 5 + Math.floor(Math.random() * 15),
    })),
  };
}

export default AnalyticsWidgets;
