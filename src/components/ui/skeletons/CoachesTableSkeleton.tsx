"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface CoachesTableSkeletonProps {
  rows?: number;
}

export function CoachesTableSkeleton({ rows = 4 }: CoachesTableSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Header Skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Skeleton className="h-10 w-[160px]" />
      </div>

      {/* Coach Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-[140px]" />
                <Skeleton className="h-4 w-[180px]" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-[100px]" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-5 w-[60px] rounded-full" />
                <Skeleton className="h-5 w-[60px] rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
