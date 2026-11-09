"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Users, CreditCard, TrendingDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardAlert } from "@/lib/dashboard/alerts";

interface AlertsWidgetProps {
  alerts: DashboardAlert[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function AlertsWidget({ alerts, loading = false, error = null, onRetry }: AlertsWidgetProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter((alert) => !dismissedAlerts.has(alert.id));

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts((prev) => new Set([...prev, alertId]));
  };

  const getAlertIcon = (type: DashboardAlert["type"]) => {
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

  const getSeverityColor = (severity: DashboardAlert["severity"]) => {
    switch (severity) {
      case "high":
        return "border border-signal/30 bg-signal-wash dark:border-signal/40 dark:bg-signal/10";
      case "medium":
        return "border border-chalk-line bg-chalk-dust dark:border-border dark:bg-muted";
      case "low":
        return "border border-chalk-line bg-mat-wash dark:border-border dark:bg-mat/15";
    }
  };

  const getSeverityIconColor = (severity: DashboardAlert["severity"]) => {
    switch (severity) {
      case "high":
        return "bg-signal-wash text-signal-ink dark:bg-signal/20 dark:text-signal-light";
      case "medium":
        return "bg-mat-wash text-mat-deep dark:bg-mat/25 dark:text-mat-lane";
      case "low":
        return "bg-mat-wash text-mat dark:bg-mat/25 dark:text-mat-lane";
    }
  };

  if (loading && visibleAlerts.length === 0) {
    return null;
  }

  if (error && visibleAlerts.length === 0) {
    return (
      <div className="rounded-lg border border-signal/30 bg-signal-wash p-4" role="alert" aria-live="polite">
        <p className="text-sm text-signal-ink">{error}</p>
        {onRetry && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>Reintentar</Button>}
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-5 dark:border-border dark:border-t-mat-lane dark:bg-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-signal-wash text-signal-ink">
            <AlertTriangle className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h3 className="font-display text-2xl font-black uppercase leading-none text-mat-night dark:text-foreground">
              {visibleAlerts.length} {visibleAlerts.length === 1 ? "alerta requiere atención" : "alertas requieren atención"}
            </h3>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {visibleAlerts.slice(0, 3).map((alert) => {
          const Icon = getAlertIcon(alert.type);
          return (
            <div
              key={alert.id}
              className={cn(
                "relative flex items-start gap-3 rounded-md border p-4 transition-colors hover:border-mat",
                getSeverityColor(alert.severity)
              )}
            >
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", getSeverityIconColor(alert.severity))}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-lg hover:bg-muted"
                    onClick={() => dismissAlert(alert.id)}
                    aria-label={`Descartar alerta: ${alert.title}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {alert.link && (
                  <Link
                    href={alert.link}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
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

      {visibleAlerts.length > 3 && (
        <div className="border-t border-border pt-3">
          <p className="text-center text-xs font-medium text-muted-foreground">
            Y {visibleAlerts.length - 3} {visibleAlerts.length - 3 === 1 ? "alerta más" : "alertas más"}
          </p>
        </div>
      )}
    </div>
  );
}
