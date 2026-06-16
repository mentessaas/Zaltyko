"use client";

import { useState, useEffect } from "react";
import { Clock, Plus, Calendar, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ScheduledReport {
  id: string;
  reportType: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: string;
  dayOfMonth?: string;
  hour: string;
  format: string;
  recipients: string[];
  nextRun: string;
  lastRun?: string;
  active: boolean;
}

interface ScheduledReportsProps {
  academyId: string;
}

export function ScheduledReports({ academyId }: ScheduledReportsProps) {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    reportType: "attendance",
    name: "",
    frequency: "weekly" as "daily" | "weekly" | "monthly",
    dayOfWeek: "1",
    dayOfMonth: "1",
    hour: "09:00",
    format: "pdf",
    recipients: "",
    active: true,
  });

  useEffect(() => {
    fetchReports();
  }, [academyId]);

  const fetchReports = async () => {
    try {
      const res = await fetch(`/api/reports/scheduled?academyId=${academyId}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (error) {
      console.error("Error fetching scheduled reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.recipients) return;

    setSaving(true);
    try {
      const res = await fetch("/api/reports/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          reportType: formData.reportType,
          name: formData.name,
          frequency: formData.frequency,
          dayOfWeek: formData.frequency === "weekly" ? formData.dayOfWeek : undefined,
          dayOfMonth: formData.frequency === "monthly" ? formData.dayOfMonth : undefined,
          hour: formData.hour,
          format: formData.format,
          recipients: formData.recipients.split(",").map((e) => e.trim()).filter(Boolean),
          active: formData.active,
        }),
      });

      if (res.ok) {
        setShowDialog(false);
        setFormData({
          reportType: "attendance",
          name: "",
          frequency: "weekly",
          dayOfWeek: "1",
          dayOfMonth: "1",
          hour: "09:00",
          format: "pdf",
          recipients: "",
          active: true,
        });
        fetchReports();
      }
    } catch (error) {
      console.error("Error creating scheduled report:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/reports/scheduled/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchReports();
      }
    } catch (error) {
      console.error("Error deleting scheduled report:", error);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/reports/scheduled/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        fetchReports();
      }
    } catch (error) {
      console.error("Error toggling scheduled report:", error);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      attendance: "Asistencia",
      financial: "Financiero",
      progress: "Progreso",
      class: "Clases",
      coach: "Entrenadores",
      churn: "Bajas",
      events: "Eventos",
    };
    return labels[type] || type;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      daily: "Diario",
      weekly: "Semanal",
      monthly: "Mensual",
    };
    return labels[frequency] || frequency;
  };

  const getFrequencyColor = (frequency: string) => {
    const colors: Record<string, string> = {
      daily: "bg-red-100 text-red-800",
      weekly: "bg-blue-100 text-blue-800",
      monthly: "bg-green-100 text-green-800",
    };
    return colors[frequency] || "bg-gray-100 text-gray-800";
  };

  const formatNextRun = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Hoy";
    if (days === 1) return "Mañana";
    if (days < 7) return `En ${days} días`;
    if (days < 30) return `En ${Math.floor(days / 7)} semanas`;
    return `En ${Math.floor(days / 30)} meses`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Reportes Programados
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Programar
          </Button>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                No hay reportes programados
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Programar Reporte
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{report.name}</p>
                      <Badge className={getFrequencyColor(report.frequency)}>
                        {getFrequencyLabel(report.frequency)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tipo: {getTypeLabel(report.reportType)} | Formato: {report.format.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Próxima ejecución: {formatNextRun(report.nextRun)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Destinatarios: {report.recipients.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(report.id, report.active)}
                      className={report.active ? "text-green-600" : "text-gray-400"}
                    >
                      {report.active ? "Activo" : "Inactivo"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(report.id)}
                      disabled={deleting === report.id}
                    >
                      {deleting === report.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para crear nuevo scheduled report */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Programar Nuevo Reporte</DialogTitle>
            <DialogDescription>
              Configura un reporte que se generará y enviará automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre del reporte</Label>
              <Input
                id="name"
                placeholder="Reporte semanal de asistencia"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reportType">Tipo de reporte</Label>
              <Select
                value={formData.reportType}
                onValueChange={(value) => setFormData({ ...formData, reportType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">Asistencia</SelectItem>
                  <SelectItem value="financial">Financiero</SelectItem>
                  <SelectItem value="events">Eventos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="frequency">Frecuencia</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: string) =>
                    setFormData({ ...formData, frequency: value as "daily" | "weekly" | "monthly" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Frecuencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hour">Hora</Label>
                <Input
                  id="hour"
                  type="time"
                  value={formData.hour}
                  onChange={(e) => setFormData({ ...formData, hour: e.target.value })}
                />
              </div>
            </div>

            {formData.frequency === "weekly" && (
              <div className="grid gap-2">
                <Label htmlFor="dayOfWeek">Día de la semana</Label>
                <Select
                  value={formData.dayOfWeek}
                  onValueChange={(value) => setFormData({ ...formData, dayOfWeek: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar día" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Domingo</SelectItem>
                    <SelectItem value="1">Lunes</SelectItem>
                    <SelectItem value="2">Martes</SelectItem>
                    <SelectItem value="3">Miércoles</SelectItem>
                    <SelectItem value="4">Jueves</SelectItem>
                    <SelectItem value="5">Viernes</SelectItem>
                    <SelectItem value="6">Sábado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.frequency === "monthly" && (
              <div className="grid gap-2">
                <Label htmlFor="dayOfMonth">Día del mes</Label>
                <Select
                  value={formData.dayOfMonth}
                  onValueChange={(value) => setFormData({ ...formData, dayOfMonth: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar día" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="format">Formato</Label>
              <Select
                value={formData.format}
                onValueChange={(value) => setFormData({ ...formData, format: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Formato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="recipients">Destinatarios (emails separados por coma)</Label>
              <Input
                id="recipients"
                placeholder="email1@ejemplo.com, email2@ejemplo.com"
                value={formData.recipients}
                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.name || !formData.recipients || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Programar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
