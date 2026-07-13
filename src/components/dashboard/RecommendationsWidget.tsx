"use client";

import { Lightbulb, TrendingUp, Users, Calendar } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface RecommendationsWidgetProps {
  academyId: string;
  userRole?: string;
  metrics?: {
    athletesCount?: number;
    classesThisWeek?: number;
    pendingPayments?: number;
    attendanceRate?: number;
  };
}

export function RecommendationsWidget({ academyId, userRole, metrics }: RecommendationsWidgetProps) {
  const { specialization } = useAcademyContext();
  const recommendations = [
    {
      icon: Users,
      text: `Añade ${specialization.labels.athletesPlural.toLowerCase()} a grupos para organizar mejor las clases`,
    },
    {
      icon: Calendar,
      text: "Revisa los horarios de clase para optimizar espacios",
    },
    {
      icon: TrendingUp,
      text: "Configura evaluaciones mensuales para seguir el progreso",
    },
  ];

  return (
    <Card className="border-zaltyko-mist/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <Lightbulb className="h-5 w-5 text-zaltyko-teal" />
          Recomendaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec, index) => {
          const Icon = rec.icon;
          return (
            <div
              key={index}
              className="flex items-start gap-3 rounded-xl bg-zaltyko-white p-3 transition-colors hover:bg-zaltyko-teal/5"
            >
              <div className="mt-0.5 rounded-lg bg-zaltyko-teal/10 p-2">
                <Icon className="h-4 w-4 text-zaltyko-teal" />
              </div>
              <p className="text-sm leading-relaxed text-zaltyko-text-secondary">{rec.text}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
