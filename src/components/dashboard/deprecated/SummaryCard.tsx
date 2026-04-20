"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Metric {
  label: string;
  value: string;
  change: number;
  changeType: "positive" | "negative";
}

interface SummaryCardProps {
  title: string;
  period: string;
  metrics: Metric[];
  chart?: React.ReactNode;
}

export function SummaryCard({ title, period, metrics, chart }: SummaryCardProps) {
  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span className="text-xs text-zaltyko-text-secondary">{period}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {chart && <div className="h-[120px] w-full">{chart}</div>}
        <div className="space-y-4">
          {metrics.map((metric, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm text-zaltyko-text-secondary">{metric.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-zaltyko-text-main">{metric.value}</span>
                <div
                  className={`flex items-center gap-0.5 text-xs font-medium ${
                    metric.changeType === "positive" ? "text-zaltyko-success" : "text-zaltyko-danger"
                  }`}
                >
                  {metric.changeType === "positive" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{Math.abs(metric.change)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

