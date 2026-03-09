import { AthletesTableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AthletesLoadingPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <Skeleton className="h-4 w-[80px] mb-2" />
          <Skeleton className="h-8 w-[40px]" />
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <Skeleton className="h-4 w-[50px] mb-2" />
          <Skeleton className="h-8 w-[40px]" />
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <Skeleton className="h-4 w-[60px] mb-2" />
          <Skeleton className="h-8 w-[40px]" />
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
          <Skeleton className="h-4 w-[60px] mb-2" />
          <Skeleton className="h-8 w-[40px]" />
        </div>
      </div>

      {/* Level Distribution Skeleton */}
      <div className="rounded-xl border bg-card p-6 shadow">
        <Skeleton className="h-6 w-[180px] mb-4" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-8 w-[80px] rounded-full" />
          <Skeleton className="h-8 w-[100px] rounded-full" />
          <Skeleton className="h-8 w-[70px] rounded-full" />
        </div>
      </div>

      {/* Header Skeleton */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-[100px]" />
          <Skeleton className="h-4 w-[350px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-[120px]" />
          <Skeleton className="h-10 w-[100px]" />
        </div>
      </div>

      <AthletesTableSkeleton rows={5} />
    </div>
  );
}
