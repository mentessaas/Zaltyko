import { EventsGridSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoadingPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Page Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-8 w-[100px]" />
          </div>
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Skeleton className="h-10 w-[130px]" />
      </div>

      <EventsGridSkeleton rows={6} />
    </div>
  );
}
