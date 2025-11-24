"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Users, CreditCard, TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  type: "capacity" | "payment" | "attendance";
  title: string;
  message: string;
  severity: "high" | "medium" | "low";
  link?: string;
}

interface AlertsWidgetProps {
  academyId: string;
}

export function AlertsWidget({ academyId }: AlertsWidgetProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAlerts();
    // Recargar cada 5 minutos
    const interval = setInterval(loadAlerts, 300000);
    return () => clearInterval(interval);
  }, [academyId]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const [capacityRes, paymentRes, attendanceRes] = await Promise.all([
        fetch(`/api/alerts/capacity?academyId=${academyId}`),
        fetch(`/api/alerts/payments?academyId=${academyId}`),
        fetch(`/api/alerts/attendance?academyId=${academyId}`),
      ]);

      const allAlerts: Alert[] = [];

      if (capacityRes.ok) {
        const data = await capacityRes.json();
        if (Array.isArray(data.alerts)) {
          data.alerts.forEach((alert: any) => {
            allAlerts.push({
              id: `capacity-${alert.classId}`,
              type: "capacity",
              title: `Cupo lleno: ${alert.className}`,
              message: `${alert.currentCapacity}/${alert.maxCapacity} atletas (${alert.percentage}%)`,
              severity: alert.percentage >= 95 ? "high" : "medium",
              link: `/app/${academyId}/classes/${alert.classId}`,
            });
          });
        }
      }

      if (paymentRes.ok) {
        const data = await paymentRes.json();
        if (Array.isArray(data.alerts)) {
          data.alerts.forEach((alert: any) => {
            allAlerts.push({
              id: `payment-${alert.chargeId}`,
              type: "payment",
              title: `Pago atrasado: ${alert.athleteName}`,
              message: `€${alert.amount.toFixed(2)} vencido hace ${Math.floor((Date.now() - new Date(alert.dueDate).getTime()) / (1000 * 60 * 60 * 24))} días`,
              severity: "high",
              link: `/app/${academyId}/billing`,
            });
          });
        }
      }

      if (attendanceRes.ok) {
        const data = await attendanceRes.json();
        if (Array.isArray(data.alerts)) {
          data.alerts.forEach((alert: any) => {
            allAlerts.push({
              id: `attendance-${alert.athleteId}`,
              type: "attendance",
              title: `Baja asistencia: ${alert.athleteName}`,
              message: `${alert.attendanceRate}% (umbral: ${alert.threshold}%)`,
              severity: alert.attendanceRate < 50 ? "high" : "medium",
              link: `/app/${academyId}/athletes/${alert.athleteId}`,
            });
          });
        }
      }

      setAlerts(allAlerts.filter((a) => !dismissedAlerts.has(a.id)));
    } catch (error) {
      console.error("Error loading alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts((prev) => new Set([...prev, alertId]));
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const getAlertIcon = (type: Alert["type"]) => {
    switch (type) {
      case "capacity":
        return Users;
      case "payment":
        return CreditCard;
      case "attendance":
        return TrendingDown;
      default:
        return AlertTriangle;
    }
  };

  const getSeverityColor = (severity: Alert["severity"]) => {
    switch (severity) {
      case "high":
        return "border-red-500/50 bg-red-50 dark:bg-red-950/20";
      case "medium":
        return "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20";
      case "low":
        return "border-blue-500/50 bg-blue-50 dark:bg-blue-950/20";
    }
  };

  if (loading && alerts.length === 0) {
    return null;
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Alertas activas
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {alerts.length} {alerts.length === 1 ? "alerta requiere atención" : "alertas requieren atención"}
          </h3>
        </div>
        <AlertTriangle className="h-5 w-5 text-amber-500" strokeWidth={1.6} />
      </header>

      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert) => {
          const Icon = getAlertIcon(alert.type);
          return (
            <div
              key={alert.id}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 transition",
                getSeverityColor(alert.severity)
              )}
            >
              <div className="flex-shrink-0">
                <Icon className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{alert.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => dismissAlert(alert.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {alert.link && (
                  <Link
                    href={alert.link}
                    className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Ver detalles →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 3 && (
        <div className="pt-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground text-center">
            Y {alerts.length - 3} {alerts.length - 3 === 1 ? "alerta más" : "alertas más"}
          </p>
        </div>
      )}
    </div>
  );
}

