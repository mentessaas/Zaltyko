"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PublicProfileBadgeProps {
  coachId: string;
  academyId: string;
  isPublic: boolean;
  className?: string;
}

export function PublicProfileBadge({
  coachId,
  academyId,
  isPublic,
  className,
}: PublicProfileBadgeProps) {
  if (!isPublic) {
    return null;
  }

  return (
    <Link
      href={`/app/${academyId}/coaches/${coachId}/public-settings`}
      className={cn("inline-flex items-center", className)}
    >
      <Badge variant="outline" className="gap-1 text-xs hover:bg-primary/10">
        <Globe className="h-3 w-3" />
        Público
      </Badge>
    </Link>
  );
}

