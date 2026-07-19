"use client";

import { Users, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AthleteRetentionWidgetProps {
  academyId: string;
}

const DATA = [
  { month: "Ene", rate: 94 },
  { month: "Feb", rate: 91 },
  { month: "Mar", rate: 89 },
  { month: "Abr", rate: 92 },
  { month: "May", rate: 96 },
  { month: "Jun", rate: 93 },
];

export function AthleteRetentionWidget({ academyId }: AthleteRetentionWidgetProps) {
  const lastMonthRetention = DATA[DATA.length - 1].rate;
  const currentMonthName = DATA[DATA.length - 1].month;

  return (
    <Card className="border-zaltyko-mist/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <Users className="h-5 w-5 text-zaltyko-indigo" />
          Retención de atletas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-display font-bold text-zaltyko-navy">{lastMonthRetention}%</p>
            <p className="text-sm text-zaltyko-text-secondary">Este mes</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-zaltyko-teal/12 px-3 py-1">
            <TrendingDown className="h-4 w-4 text-zaltyko-teal" />
            <span className="text-sm font-semibold text-zaltyko-teal">+2%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {DATA.map((item) => {
            const isCurrentMonth = item.month === currentMonthName;
            return (
              <div key={item.month} className="flex items-center gap-3">
                <span className="w-8 text-xs text-zaltyko-text-secondary">{item.month}</span>
                <div className="h-2 flex-1 rounded-full bg-zaltyko-mist/50">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCurrentMonth ? "bg-zaltyko-teal" : "bg-zaltyko-indigo/30"
                    }`}
                    style={{ width: `${item.rate}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-zaltyko-navy">{item.rate}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
