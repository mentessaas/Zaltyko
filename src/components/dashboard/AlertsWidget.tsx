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
        return "border-red-500/30 bg-gradient-to-r from-red-50/80 to-red-100/50";
      case "medium":
        return "border-amber-500/30 bg-gradient-to-r from-amber-50/80 to-amber-100/50";
      case "low":
        return "border-blue-500/30 bg-gradient-to-r from-blue-50/80 to-blue-100/50";
    }
  };

  const getSeverityIconColor = (severity: Alert["severity"]) => {
    switch (severity) {
      case "high":
        return "bg-gradient-to-br from-red-500 to-red-600";
      case "medium":
        return "bg-gradient-to-br from-amber-500 to-amber-600";
      case "low":
        return "bg-gradient-to-br from-blue-500 to-blue-600";
    }
  };

  if (loading && alerts.length === 0) {
    return null;
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-red-200/50 bg-gradient-to-br from-red-50/30 via-white to-amber-50/30 p-6 shadow-lg shadow-red-500/10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <AlertTriangle className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600/80">
              Alertas activas
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              {alerts.length} {alerts.length === 1 ? "alerta requiere atención" : "alertas requieren atención"}
            </h3>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert) => {
          const Icon = getAlertIcon(alert.type);
          return (
            <div
              key={alert.id}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-md",
                getSeverityColor(alert.severity)
              )}
            >
              <div className={cn("flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center shadow-md", getSeverityIconColor(alert.severity))}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-zaltyko-text-main">{alert.title}</p>
                    <p className="mt-1 text-xs text-zaltyko-text-secondary">{alert.message}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg hover:bg-white/50"
                    onClick={() => dismissAlert(alert.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {alert.link && (
                  <Link
                    href={alert.link}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"
                  >
                    Ver detalles
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 3 && (
        <div className="pt-3 border-t border-red-200/30">
          <p className="text-xs font-semibold text-red-600/70 text-center">
            Y {alerts.length - 3} {alerts.length - 3 === 1 ? "alerta más" : "alertas más"}
          </p>
        </div>
      )}
    </div>
  );
}

