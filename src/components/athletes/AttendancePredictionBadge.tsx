"use client";

import { useState, useEffect } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AttendancePredictionBadgeProps {
  athleteId: string;
  academyId: string;
  showLabel?: boolean;
  className?: string;
}

interface PredictionData {
  probability: number;
  date: string;
  confidence: number;
}

export function AttendancePredictionBadge({
  athleteId,
  academyId,
  showLabel = true,
  className,
}: AttendancePredictionBadgeProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPrediction = async () => {
      if (!athleteId || !academyId) return;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/ai/attendance/predict-absence?athleteId=${athleteId}&academyId=${academyId}`
        );

        if (res.ok) {
          const data = await res.json();
          setPrediction(data);
        }
      } catch (error) {
        console.error("Error fetching prediction:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
  }, [athleteId, academyId]);

  const getColor = (probability: number) => {
    if (probability >= 0.7) return "bg-red-50 text-red-700 border-red-200";
    if (probability >= 0.4) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-green-50 text-green-700 border-green-200";
  };

  const getVariant = (probability: number) => {
    if (probability >= 0.7) return "error";
    if (probability >= 0.4) return "default";
    return "outline";
  };

  const getLabel = (probability: number) => {
    if (probability >= 0.7) return "Alto riesgo";
    if (probability >= 0.4) return "Riesgo medio";
    return "Bajo riesgo";
  };

  if (loading) {
    return (
      <Badge variant="outline" className={cn("text-xs gap-1", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Analizando
      </Badge>
    );
  }

  if (!prediction || prediction.probability < 0.3) {
    return null;
  }

  return (
    <Badge
      variant={getVariant(prediction.probability)}
      className={cn("text-xs gap-1", className)}
      title={`Probabilidad de inasistencia: ${Math.round(prediction.probability * 100)}%`}
    >
      <Calendar className="h-3 w-3" />
      {showLabel && getLabel(prediction.probability)}
      {!showLabel && `${Math.round(prediction.probability * 100)}%`}
    </Badge>
  );
}
