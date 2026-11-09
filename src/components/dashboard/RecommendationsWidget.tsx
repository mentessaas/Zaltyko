"use client";

import Link from "next/link";
import { CreditCard, Lightbulb, TrendingUp, Users, Calendar } from "lucide-react";

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

  // Recomendaciones como lista reglada, no como tarjetas dentro de tarjeta.
  return (
    <section aria-labelledby="recs-title" className="rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white">
      <h2 id="recs-title" className="font-display flex items-center gap-2 px-5 pb-2 pt-4 text-2xl font-black uppercase leading-none text-mat-night">
        <Lightbulb aria-hidden className="h-5 w-5 text-mat" />
        Recomendaciones
      </h2>
      <ul>
        {recommendations.map((rec, index) => {
          const Icon = rec.icon;
          const content = (
            <span className="flex items-center gap-3 border-t border-chalk-line px-5 py-3.5 transition-colors group-hover:bg-mat-wash">
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-mat" />
              <span className="text-base leading-relaxed text-ramp-600 group-hover:text-mat-night">{rec.text}</span>
            </span>
          );
          return (
            <li key={index}>
              {rec.href ? (
                <Link href={rec.href} className="group block">
                  {content}
                </Link>
              ) : (
                <div className="group">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
