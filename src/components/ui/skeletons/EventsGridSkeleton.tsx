"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface EventsGridSkeletonProps {
  rows?: number;
}

export function EventsGridSkeleton({ rows = 6 }: EventsGridSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Events Grid Skeleton */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <Skeleton className="h-6 w-[160px]" />
              <Skeleton className="h-5 w-[60px] rounded-full" />
            </div>
            <Skeleton className="h-4 w-[120px] mb-2" />
            <Skeleton className="h-4 w-[100px] mb-2" />
            <Skeleton className="h-4 w-[140px]" />
            <div className="mt-4 pt-4 border-t">
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
