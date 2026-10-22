"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { CommercialPlanSlug } from "@/lib/growth/contracts";
import { capturePublicGrowthEvent, getPublicAttribution } from "@/lib/growth/client";

interface TrackedPlanLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
  planCode: CommercialPlanSlug;
}

export function TrackedPlanLink({ children, className, href, planCode }: TrackedPlanLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        capturePublicGrowthEvent({
          eventName: "pricing_plan_selected",
          planCode,
          source: "public_pricing",
          properties: getPublicAttribution(),
        });
      }}
    >
      {children}
    </Link>
  );
}
