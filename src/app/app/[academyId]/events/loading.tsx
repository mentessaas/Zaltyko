import { TableSkeleton, StatsGridSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <Skeleton className="h-8 w-[160px]" />
        <Skeleton className="h-4 w-[300px]" />
      </header>
      <StatsGridSkeleton count={3} />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
