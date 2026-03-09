"use client";

import { useCallback, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  resistance?: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only activate when pulling down from the top
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only activate when pulling down
    if (diff > 0) {
      e.preventDefault();
      const distance = Math.min(diff / resistance, threshold * 1.5);
      setPullDistance(distance);
    }
  }, [resistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;

    isPulling.current = false;
    setPullDistance(0);

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [onRefresh, pullDistance, threshold]);

  return {
    isRefreshing,
    pullDistance,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

// Hook for detecting mobile viewport
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  if (typeof window !== "undefined") {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    checkMobile();
  }

  return isMobile;
}

// Hook for infinite scroll using Intersection Observer
export function useInfiniteScroll(
  callback: () => void,
  options?: IntersectionObserverInit
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  const setTarget = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (node) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            callback();
          }
        },
        {
          threshold: 0.1,
          rootMargin: "100px",
          ...options,
        }
      );
      observerRef.current.observe(node);
      targetRef.current = node;
    }
  }, [callback, options]);

  return setTarget;
}

// Skeleton loader components for mobile optimization
export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg h-24 w-full" />
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center space-x-4 p-4">
      <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-full h-10 w-10" />
      <div className="flex-1 space-y-2">
        <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded h-4 w-3/4" />
        <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </div>
  );
}
