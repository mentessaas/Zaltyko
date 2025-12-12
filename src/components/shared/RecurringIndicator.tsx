"use client";

import Link from "next/link";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RecurringIndicatorProps {
  classId: string;
  academyId: string;
  autoGenerateSessions: boolean;
  className?: string;
}

export function RecurringIndicator({
  classId,
  academyId,
  autoGenerateSessions,
  className,
}: RecurringIndicatorProps) {
  if (!autoGenerateSessions) {
    return null;
  }

  return (
    <Link
      href={`/app/${academyId}/classes/${classId}/recurring`}
      className={cn("inline-flex items-center", className)}
    >
      <Badge variant="outline" className="gap-1 text-xs hover:bg-primary/10">
        <Repeat className="h-3 w-3" />
        Recurrente
      </Badge>
    </Link>
  );
}

