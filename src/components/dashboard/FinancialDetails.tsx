"use client";

import { FinancialMetricsWidget } from "./FinancialMetricsWidget";
import { QuickReportsWidget } from "./QuickReportsWidget";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { AthleteRetentionWidget } from "./AthleteRetentionWidget";
import { PopularClassesWidget } from "./PopularClassesWidget";

interface FinancialDetailsProps {
  academyId: string;
}

export function FinancialDetails({ academyId }: FinancialDetailsProps) {
  return (
    <div className="space-y-4 p-4 pt-0">
      <div className="grid gap-4 lg:grid-cols-2">
        <FinancialMetricsWidget academyId={academyId} />
        <QuickReportsWidget academyId={academyId} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueTrendChart academyId={academyId} />
        <AthleteRetentionWidget academyId={academyId} />
      </div>
      <PopularClassesWidget academyId={academyId} />
    </div>
  );
}
