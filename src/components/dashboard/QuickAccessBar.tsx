"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUICK_ACTIONS } from "@/lib/quick-actions";

interface QuickAccessBarProps {
  academyId: string;
}

export function QuickAccessBar({ academyId }: QuickAccessBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Plus className="h-3.5 w-3.5" />
        Accesos rápidos:
      </div>
      {QUICK_ACTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href(academyId)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Icon className={`h-3.5 w-3.5 ${item.textColor}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

