import { TableSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 rounded-[24px]" />
      <TableSkeleton
        columns={[
          { width: "w-1/3" },
          { width: "w-1/5" },
          { width: "w-1/6" },
          { width: "w-1/6" },
          { width: "w-1/8", align: "right" },
        ]}
        rows={8}
      />
    </div>
  );
}
