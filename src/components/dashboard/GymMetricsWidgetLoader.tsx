"use client";

import { useState, useEffect } from "react";
import { GymMetricsWidget } from "@/components/dashboard/GymMetricsWidget";

interface GymMetricsWidgetLoaderProps {
  academyId: string;
}

export function GymMetricsWidgetLoader({ academyId }: GymMetricsWidgetLoaderProps) {
  const [metrics, setMetrics] = useState<{
    athletesByCategory: any[];
    expiringLicenses: any[];
    expiringLicensesThisWeek: number;
    expiringLicensesThisMonth: number;
    upcomingCompetitions: any[];
    assessmentsThisMonth: number;
    totalAthletesWithActiveLicense: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch(`/api/dashboard/${academyId}/gr-metrics`);
        if (!response.ok) {
          // Gym metrics not available for this academy type
          setError("not_available");
          return;
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error("Error fetching GR metrics:", err);
        setError("error");
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [academyId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return null;
  }

  return (
    <GymMetricsWidget
      academyId={academyId}
      athletesByCategory={metrics.athletesByCategory}
      expiringLicenses={metrics.expiringLicenses}
      expiringLicensesThisWeek={metrics.expiringLicensesThisWeek}
      expiringLicensesThisMonth={metrics.expiringLicensesThisMonth}
      upcomingCompetitions={metrics.upcomingCompetitions}
      assessmentsThisMonth={metrics.assessmentsThisMonth}
      totalAthletesWithActiveLicense={metrics.totalAthletesWithActiveLicense}
    />
  );
}
