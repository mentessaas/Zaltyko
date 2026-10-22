import { AthletesTableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AcademyAthletesLoadingPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header Skeleton */}
      <header className="space-y-2 py-6">
        <Skeleton className="h-8 w-[100px]" />
        <Skeleton className="h-4 w-[280px]" />
      </header>

      <AthletesTableSkeleton rows={5} />
    </div>
  );
}
