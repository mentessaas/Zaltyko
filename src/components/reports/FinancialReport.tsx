"use client";

import { useState, useEffect } from "react";
import { DollarSign, Download, FileText, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { format, subMonths } from "date-fns";
import { formatLongDateForCountry, formatDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";

interface FinancialStats {
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCharges: number;
  paidCharges: number;
  pendingCharges: number;
  overdueCharges: number;
  averagePaymentTime: number;
  bySportConfig?: SportFinancialBreakdown[];
}

interface SportFinancialBreakdown {
  sportConfigId: string | null;
  label: string;
  disciplineName: string | null;
  branchName: string | null;
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalCharges: number;
  paidCharges: number;
  pendingCharges: number;
  overdueCharges: number;
  activeScholarships: number;
  discountAmount: number;
  coachCostAmount: number;
  directExpenseAmount: number;
  allocatedAcademyExpenseAmount: number;
  estimatedCostAmount: number;
  estimatedMarginAmount: number;
  estimatedMarginRate: number | null;
  profitabilityStatus: "profitable" | "at_risk" | "loss" | "unknown";
}

interface FinancialReportProps {
  academyId: string;
  academyCountry?: string | null;
  initialData?: FinancialStats;
  sportConfigs?: Array<{
    id: string;
    disciplineName: string;
    branchName: string;
  }>;
}

export function FinancialReport({
  academyId,
  academyCountry,
  initialData,
  sportConfigs = [],
}: FinancialReportProps) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 3), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sportConfigId, setSportConfigId] = useState("");
  const [reportData, setReportData] = useState<FinancialStats | null>(initialData || null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [delinquencyData, setDelinquencyData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "monthly" | "delinquency">("overview");

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        academyId,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sportConfigId && { sportConfigId }),
      });

      const [statsResponse, monthlyResponse, delinquencyResponse] = await Promise.all([
        fetch(`/api/reports/financial?${params}`),
        fetch(`/api/reports/financial/monthly?${params}`),
        fetch(`/api/reports/financial/delinquency?${params}`),
      ]);

      if (!statsResponse.ok) {
        throw new Error("Error al generar reporte");
      }

      const statsData = await statsResponse.json();
      setReportData(statsData.data);

      if (monthlyResponse.ok) {
        const monthlyData = await monthlyResponse.json();
        setMonthlyData(monthlyData.data || []);
      }

      if (delinquencyResponse.ok) {
        const delinquencyData = await delinquencyResponse.json();
        setDelinquencyData(delinquencyData.data || []);
      }
    } catch (err: unknown) {
      setError(err.message || "Error al generar reporte");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialData) {
      setReportData(initialData);
    }
  }, [initialData]);

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        format: "pdf",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sportConfigId && { sportConfigId }),
      });

      const response = await fetch(`/api/reports/financial/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-financiero-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.pushToast({
        title: "PDF exportado",
        description: "El reporte financiero se descargó correctamente.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast.pushToast({
        title: "No se pudo exportar el PDF",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        format: "excel",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sportConfigId && { sportConfigId }),
      });

      const response = await fetch(`/api/reports/financial/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-financiero-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.pushToast({
        title: "Excel exportado",
        description: "El reporte financiero se descargó correctamente.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast.pushToast({
        title: "No se pudo exportar el Excel",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reporte Financiero</h2>
          <p className="text-muted-foreground mt-1">
            Análisis de ingresos, pagos y morosidad
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="start-date">Fecha Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Fecha Fin</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rama / modalidad</Label>
              <Select
                value={sportConfigId || "all"}
                onValueChange={(value) => setSportConfigId(value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las ramas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las ramas</SelectItem>
                  {sportConfigs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.branchName} · {config.disciplineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={loadReport} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <DollarSign className="mr-2 h-4 w-4" />
                Generar Reporte
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {reportData && !isLoading && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalRevenue.toFixed(2)} €</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Pagado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {reportData.paidAmount.toFixed(2)} €
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Pendiente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {reportData.pendingAmount.toFixed(2)} €
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Vencido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {reportData.overdueAmount.toFixed(2)} €
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de Cargos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total cargos:</span>
                    <Badge>{reportData.totalCharges}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Pagados:</span>
                    <Badge variant="outline" className="bg-green-50">
                      {reportData.paidCharges}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Pendientes:</span>
                    <Badge variant="outline" className="bg-yellow-50">
                      {reportData.pendingCharges}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Vencidos:</span>
                    <Badge variant="outline" className="bg-red-50">
                      {reportData.overdueCharges}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Métricas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Tiempo promedio de pago:</span>
                    <Badge>{reportData.averagePaymentTime} días</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Tasa de cobro:</span>
                    <Badge>
                      {reportData.totalCharges > 0
                        ? ((reportData.paidCharges / reportData.totalCharges) * 100).toFixed(1)
                        : 0}
                      %
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {reportData.bySportConfig && reportData.bySportConfig.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Negocio por rama</CardTitle>
                <CardDescription>
                  Desglose de ingresos, cobros, morosidad, becas y descuentos por configuración deportiva.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Rama</th>
                        <th className="py-2 pr-3 font-medium">Total</th>
                        <th className="py-2 pr-3 font-medium">Cobrado</th>
                        <th className="py-2 pr-3 font-medium">Pendiente</th>
                        <th className="py-2 pr-3 font-medium">Morosidad</th>
                        <th className="py-2 pr-3 font-medium">Cargos</th>
                        <th className="py-2 pr-3 font-medium">Becas</th>
                        <th className="py-2 pr-3 font-medium">Descuentos</th>
                        <th className="py-2 pr-3 font-medium">Coste</th>
                        <th className="py-2 pr-3 font-medium">Margen</th>
                        <th className="py-2 pr-3 font-medium">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.bySportConfig.map((item) => (
                        <tr key={item.sportConfigId ?? "unassigned"} className="border-b last:border-0">
                          <td className="py-3 pr-3 font-medium text-zaltyko-navy">{item.label}</td>
                          <td className="py-3 pr-3">{item.totalRevenue.toFixed(2)} €</td>
                          <td className="py-3 pr-3 text-green-700">{item.paidAmount.toFixed(2)} €</td>
                          <td className="py-3 pr-3 text-yellow-700">{item.pendingAmount.toFixed(2)} €</td>
                          <td className="py-3 pr-3 text-red-700">{item.overdueAmount.toFixed(2)} €</td>
                          <td className="py-3 pr-3">{item.totalCharges}</td>
                          <td className="py-3 pr-3">{item.activeScholarships}</td>
                          <td className="py-3 pr-3">{item.discountAmount.toFixed(2)} €</td>
                          <td className="py-3 pr-3">{item.estimatedCostAmount.toFixed(2)} €</td>
                          <td className={item.estimatedMarginAmount < 0 ? "py-3 pr-3 text-red-700" : "py-3 pr-3 text-green-700"}>
                            {item.estimatedMarginAmount.toFixed(2)} €
                          </td>
                          <td className="py-3 pr-3">
                            {item.estimatedMarginRate === null
                              ? "N/A"
                              : `${(item.estimatedMarginRate * 100).toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {delinquencyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Análisis de Morosidad</CardTitle>
                <CardDescription>
                  Atletas con pagos vencidos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {delinquencyData.map((item) => (
                    <div
                      key={item.athleteId}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{item.athleteName}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.sportConfigLabel} ·{" "}
                          {item.overdueCharges} cargos vencidos
                          {item.oldestOverdue &&
                            ` · Más antiguo: ${formatLongDateForCountry(item.oldestOverdue, academyCountry)}`}
                        </p>
                      </div>
                      <Badge variant="error">{item.totalOverdue.toFixed(2)} €</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {monthlyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ingresos Mensuales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {monthlyData.map((month) => (
                    <div key={month.month} className="flex items-center justify-between">
                      <span className="font-medium">
                        {formatDateForCountry(month.month + "-01", academyCountry, "MMMM yyyy")}
                      </span>
                      <div className="flex gap-4">
                        <span className="text-sm text-muted-foreground">
                          Total: {month.revenue.toFixed(2)} €
                        </span>
                        <span className="text-sm text-green-600">
                          Pagado: {month.paid.toFixed(2)} €
                        </span>
                        <span className="text-sm text-yellow-600">
                          Pendiente: {month.pending.toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
