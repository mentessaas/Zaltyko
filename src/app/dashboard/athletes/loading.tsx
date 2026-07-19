import { AthletesTableSkeleton } from "@/components/ui/skeletons/AthletesTableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AthletesLoadingPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-[180px] mb-4" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-8 w-[80px] rounded-full" />
          <Skeleton className="h-8 w-[100px] rounded-full" />
          <Skeleton className="h-8 w-[70px] rounded-full" />
        </div>
      </div>

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
