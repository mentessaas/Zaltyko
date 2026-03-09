import { CoachesTableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CoachesLoadingPage() {
  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-[150px]" />
          <Skeleton className="h-4 w-[350px]" />
        </div>
        <Skeleton className="h-10 w-[160px]" />
      </div>

      <CoachesTableSkeleton rows={4} />
    </div>
  );
}
