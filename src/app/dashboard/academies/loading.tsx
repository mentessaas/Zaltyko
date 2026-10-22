import { AcademiesGridSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AcademiesLoadingPage() {
  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* Page Header Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-[200px]" />
        </div>
        <Skeleton className="h-5 w-[400px]" />
      </div>

      <AcademiesGridSkeleton rows={3} />

      {/* Quick Actions Skeleton */}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-[100px]" />
        <Skeleton className="h-10 w-[130px]" />
        <Skeleton className="h-10 w-[100px]" />
        <Skeleton className="h-10 w-[90px]" />
      </div>
    </div>
  );
}
