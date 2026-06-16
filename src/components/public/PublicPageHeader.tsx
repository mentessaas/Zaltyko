"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublicPageHeaderProps {
  title: string;
  publishHref: string;
  publishLabel: string;
  dashboardHref: string;
  dashboardLabel: string;
}

export function PublicPageHeader({
  title,
  publishHref,
  publishLabel,
  dashboardHref,
  dashboardLabel,
}: PublicPageHeaderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.ok ? setIsAuthenticated(true) : setIsAuthenticated(false))
      .catch(() => setIsAuthenticated(false));
  }, []);

  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="flex items-center gap-3">
        {isAuthenticated && (
          <Button asChild variant="outline">
            <Link href={dashboardHref}>
              <ListOrdered className="mr-2 h-4 w-4" />
              {dashboardLabel}
            </Link>
          </Button>
        )}
        <Button asChild>
          <Link href={publishHref}>
            <Plus className="mr-2 h-4 w-4" />
            {publishLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
