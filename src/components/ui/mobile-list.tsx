"use client";

import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfiniteListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  skeletonCount?: number;
  renderSkeleton?: () => ReactNode;
  className?: string;
  keyExtractor: (item: T) => string;
}

export function InfiniteList<T>({
  items,
  renderItem,
  hasMore,
  isLoading,
  onLoadMore,
  onRefresh,
  skeletonCount = 3,
  renderSkeleton,
  className,
  keyExtractor,
}: InfiniteListProps<T>) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [localIsLoading, setLocalIsLoading] = useState(false);

  // Handle infinite scroll
  useEffect(() => {
    if (!hasMore || isLoading || localIsLoading) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLocalIsLoading(true);
          onLoadMore().finally(() => {
            setLocalIsLoading(false);
          });
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMore, isLoading, localIsLoading, onLoadMore]);

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    }
  }, [onRefresh]);

  return (
    <div className={cn("relative", className)}>
      {/* Pull to refresh */}
      {onRefresh && (
        <PullToRefreshSimple onRefresh={handleRefresh} />
      )}

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={keyExtractor(item)}>{renderItem(item, index)}</div>
        ))}
      </div>

      {/* Loading skeleton */}
      {(isLoading || localIsLoading) && (
        <div className="mt-4">
          {renderSkeleton ? (
            renderSkeleton()
          ) : (
            <div className="space-y-3">
              {Array.from({ length: skeletonCount }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Load more trigger */}
      {hasMore && !isLoading && (
        <div ref={loadMoreRef} className="h-10" />
      )}

      {/* End of list */}
      {!hasMore && items.length > 0 && (
        <p className="text-center text-gray-400 text-sm py-4">
          No hay más elementos
        </p>
      )}
    </div>
  );
}

// Simple pull to refresh component
function PullToRefreshSimple({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPulling.current) return;
    currentY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    const diff = currentY.current - startY.current;
    if (diff > 80) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex items-center justify-center py-2 transition-opacity",
        isRefreshing ? "opacity-100" : "opacity-0"
      )}
    >
      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      <span className="ml-2 text-sm text-gray-500">Actualizando...</span>
    </div>
  );
}

// Skeleton row component
function SkeletonRow() {
  return (
    <div className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg animate-pulse">
      <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}

// Mobile optimized card component
interface MobileCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export function MobileCard({
  children,
  onClick,
  className,
  active,
}: MobileCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4",
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        active && "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
        className
      )}
    >
      {children}
    </div>
  );
}

// Swipeable list item for mobile
interface SwipeAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface SwipeableListItemProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  onClick?: () => void;
  className?: string;
}

export function SwipeableListItem({
  children,
  leftAction,
  rightAction,
  onClick,
  className,
}: SwipeableListItemProps) {
  const [translateX, setTranslateX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;

    const diff = e.touches[0].clientX - startX.current;
    const maxTranslate = 100;

    if (diff < 0 && leftAction) {
      setTranslateX(Math.max(diff, -maxTranslate));
    } else if (diff > 0 && rightAction) {
      setTranslateX(Math.min(diff, maxTranslate));
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;

    if (translateX < -50 && leftAction) {
      leftAction.onClick();
    } else if (translateX > 50 && rightAction) {
      rightAction.onClick();
    }

    setTranslateX(0);
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Background actions */}
      {leftAction && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-center px-4 bg-red-500 text-white",
            translateX < 0 ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            onClick={leftAction.onClick}
            className="flex flex-col items-center gap-1"
          >
            {leftAction.icon}
            <span className="text-xs">{leftAction.label}</span>
          </button>
        </div>
      )}

      {rightAction && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-center px-4 bg-green-500 text-white",
            translateX > 0 ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            onClick={rightAction.onClick}
            className="flex flex-col items-center gap-1"
          >
            {rightAction.icon}
            <span className="text-xs">{rightAction.label}</span>
          </button>
        </div>
      )}

      {/* Main content */}
      <div
        ref={itemRef}
        className="bg-white dark:bg-gray-900 touch-none"
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
}
