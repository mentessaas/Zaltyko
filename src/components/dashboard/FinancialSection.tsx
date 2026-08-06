"use client";

import { Wallet, ChevronUp, ChevronDown } from "lucide-react";

import { FinancialMetricsWidget } from "./FinancialMetricsWidget";
import { QuickReportsWidget } from "./QuickReportsWidget";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { AthleteRetentionWidget } from "./AthleteRetentionWidget";
import { PopularClassesWidget } from "./PopularClassesWidget";

interface FinancialSectionProps {
  academyId: string;
  isAdmin: boolean;
  isOwner: boolean;
  showFinancials: boolean;
  onToggleFinancials: () => void;
}

export function FinancialSection({
  academyId,
  isAdmin,
  isOwner,
  showFinancials,
  onToggleFinancials,
}: FinancialSectionProps) {
  if (!isAdmin && !isOwner) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
      <button
        type="button"
        onClick={onToggleFinancials}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-zaltyko-white/80"
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-zaltyko-teal" />
          <span className="font-medium">Métricas Financieras</span>
        </div>
        {showFinancials ? (
          <ChevronUp className="h-4 w-4 text-zaltyko-text-secondary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zaltyko-text-secondary" />
        )}
      </button>
      {showFinancials && (
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
      )}
    </section>
  );
}
