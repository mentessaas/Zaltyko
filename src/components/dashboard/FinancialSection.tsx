"use client";

import dynamic from "next/dynamic";
import { Wallet, ChevronUp, ChevronDown } from "lucide-react";

const FinancialDetails = dynamic(
  () => import("./FinancialDetails").then((module) => ({ default: module.FinancialDetails })),
  {
    loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Cargando métricas financieras" />,
  }
);

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
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <button
        type="button"
        onClick={onToggleFinancials}
        className="flex min-h-11 w-full items-center justify-between p-5 text-left transition hover:bg-muted/80"
        aria-expanded={showFinancials}
        aria-controls={`financial-details-${academyId}`}
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-zaltyko-teal" />
          <span className="font-medium">Métricas Financieras</span>
        </div>
        {showFinancials ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {showFinancials && (
        <div id={`financial-details-${academyId}`}>
          <FinancialDetails academyId={academyId} />
        </div>
      )}
    </section>
  );
}
