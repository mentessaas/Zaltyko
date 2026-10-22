"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface AcademiesGridSkeletonProps {
  rows?: number;
}

export function AcademiesGridSkeleton({ rows = 3 }: AcademiesGridSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[280px] rounded-xl" />
      </div>

      {/* Academies Grid Skeleton */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <Skeleton className="h-7 w-[160px]" />
              <Skeleton className="h-5 w-[80px] rounded-full" />
            </div>
            <Skeleton className="h-4 w-[100px] mb-4" />
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-[140px] mb-2" />
            <Skeleton className="h-4 w-[120px]" />
            <div className="mt-4 pt-4 border-t">
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
