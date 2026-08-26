"use client";

import Link from "next/link";
import { CreditCard, Lightbulb, TrendingUp, Users, Calendar } from "lucide-react";

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
  const pendingPayments = metrics?.pendingPayments ?? 0;

  const recommendations = [
    ...(pendingPayments > 0
      ? [
          {
            icon: CreditCard,
            text: `Tienes ${pendingPayments} ${pendingPayments === 1 ? "cobro pendiente o atrasado" : "cobros pendientes o atrasados"}. Revísalos en Cobros.`,
            href: `/app/${academyId}/billing`,
          },
        ]
      : []),
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
<<<<<<< HEAD
    <Card className="border-border/80 shadow-soft">
=======
    <Card className="border-zaltyko-mist/80 shadow-soft">
>>>>>>> origin/main
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <Lightbulb className="h-5 w-5 text-zaltyko-teal" />
          Recomendaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec, index) => {
          const Icon = rec.icon;
          const content = (
            <div className="flex items-start gap-3 rounded-xl bg-zaltyko-white p-3 transition-colors hover:bg-zaltyko-teal/5">
              <div className="mt-0.5 rounded-lg bg-zaltyko-teal/10 p-2">
                <Icon className="h-4 w-4 text-zaltyko-teal" />
              </div>
<<<<<<< HEAD
              <p className="text-sm leading-relaxed text-muted-foreground">{rec.text}</p>
=======
              <p className="text-sm leading-relaxed text-zaltyko-text-secondary">{rec.text}</p>
>>>>>>> origin/main
            </div>
          );
          return rec.href ? (
            <Link key={index} href={rec.href} className="block">
              {content}
            </Link>
          ) : (
            <div key={index}>{content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
