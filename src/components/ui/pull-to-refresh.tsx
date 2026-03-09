"use client";

import { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;

    // Only activate when pulling down from the top
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || disabled) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only activate when pulling down
    if (diff > 0) {
      // Allow the pull but prevent overscroll
      const distance = Math.min(diff * 0.5, threshold * 1.5);
      setPullDistance(distance);
    }
  }, [disabled, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) return;

    isPulling.current = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error("Error refreshing:", error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [disabled, onRefresh, pullDistance, threshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center overflow-hidden transition-transform duration-200",
          isRefreshing || pullDistance > 0 ? "h-16 -translate-y-full" : "h-0"
        )}
        style={{
          transform: `translateY(-${Math.min(pullDistance, threshold)}px)`,
        }}
      >
        <div className="flex items-center gap-2 text-blue-600">
          <RefreshCw
            className={cn(
              "w-5 h-5",
              isRefreshing && "animate-spin"
            )}
          />
          <span className="text-sm font-medium">Actualizando...</span>
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}

// Swipeable list item component
interface SwipeableItemProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  className?: string;
}

export function SwipeableItem({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  className,
}: SwipeableItemProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const diff = e.touches[0].clientX - startX.current;
    const maxTranslate = 150;

    if (diff < 0 && onSwipeLeft) {
      setTranslateX(Math.max(diff, -maxTranslate));
    } else if (diff > 0 && onSwipeRight) {
      setTranslateX(Math.min(diff, maxTranslate));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    if (translateX < -75 && onSwipeLeft) {
      onSwipeLeft();
    } else if (translateX > 75 && onSwipeRight) {
      onSwipeRight();
    }

    setTranslateX(0);
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Background actions */}
      <div className="absolute inset-y-0 left-0 flex items-center pl-4">
        {rightAction}
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center pr-4">
        {leftAction}
      </div>

      {/* Swipeable content */}
      <div
        ref={itemRef}
        className="bg-white dark:bg-gray-900 transition-transform touch-none"
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
