import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-ramp-200 dark:bg-ramp-800",
        className
      )}
    />
  );
}

export { Skeleton };
