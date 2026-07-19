"use client";

import { SkipLink } from "@/components/ui/skip-link";

/**
 * Client wrapper that includes SkipLink for all dashboard pages
 * This ensures keyboard users can skip the navigation
 */
export function DashboardSkipLink() {
  return (
    <>
      <SkipLink href="#main-content">
        Saltar al contenido principal
      </SkipLink>
    </>
  );
}

export default DashboardSkipLink;
