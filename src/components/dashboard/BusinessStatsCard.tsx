"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stat {
  label: string;
  value: string;
  change: number;
  changeType: "positive" | "negative";
}

interface BusinessStatsCardProps {
  title: string;
  period: string;
  stats: Stat[];
}

export function BusinessStatsCard({ title, period, stats }: BusinessStatsCardProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span className="text-xs text-zaltyko-text-secondary">{period}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-zaltyko-border last:border-0">
              <span className="text-sm text-zaltyko-text-secondary">{stat.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-zaltyko-text-main">{stat.value}</span>
                <div
                  className={`flex items-center gap-0.5 text-xs font-medium ${
                    stat.changeType === "positive" ? "text-zaltyko-success" : "text-zaltyko-danger"
                  }`}
                >
                  {stat.changeType === "positive" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{Math.abs(stat.change)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

