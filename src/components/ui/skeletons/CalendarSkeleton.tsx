"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function CalendarSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-[250px]" />
        <Skeleton className="h-5 w-[350px]" />
      </div>

      {/* Calendar Navigation Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[100px]" />
          <Skeleton className="h-9 w-[180px]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[70px]" />
          <Skeleton className="h-9 w-[70px]" />
        </div>
      </div>

      {/* Calendar Grid Skeleton */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        {/* Week days header */}
        <div className="grid grid-cols-7 border-b">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
              <Skeleton className="h-4 w-[40px] mx-auto" />
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 divide-x">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[120px] p-2">
              <Skeleton className="h-5 w-[20px] mb-2" />
              <div className="space-y-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
