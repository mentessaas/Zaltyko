"use client";

import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RevenueTrendChartProps {
  academyId: string;
}

const MONTHLY_DATA = [
  { month: "Ene", revenue: 12400 },
  { month: "Feb", revenue: 14200 },
  { month: "Mar", revenue: 13800 },
  { month: "Abr", revenue: 15600 },
  { month: "May", revenue: 16100 },
  { month: "Jun", revenue: 14800 },
];

export function RevenueTrendChart({ academyId }: RevenueTrendChartProps) {
  const maxRevenue = Math.max(...MONTHLY_DATA.map((d) => d.revenue));

  return (
    <Card className="border-zaltyko-mist/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <TrendingUp className="h-5 w-5 text-zaltyko-teal" />
          Tendencia de ingresos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end justify-between gap-2">
          {MONTHLY_DATA.map((data, index) => {
            const height = (data.revenue / maxRevenue) * 100;
            const isLast = index === MONTHLY_DATA.length - 1;
            return (
              <div key={data.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative w-full">
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      isLast ? "bg-zaltyko-teal" : "bg-zaltyko-indigo/20"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-xs text-zaltyko-text-secondary">{data.month}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-zaltyko-white p-3">
          <span className="text-sm text-zaltyko-text-secondary">vs. mes anterior</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-zaltyko-teal">
            <TrendingUp className="h-4 w-4" />
            +8.2%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
