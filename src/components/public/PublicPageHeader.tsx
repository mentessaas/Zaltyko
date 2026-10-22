"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublicPageHeaderProps {
  title: string;
  publishHref: string;
  publishHrefTemplate?: string;
  publishLabel: string;
  dashboardHref: string;
  dashboardHrefTemplate?: string;
  dashboardLabel: string;
}

export function PublicPageHeader({
  title,
  publishHref,
  publishHrefTemplate,
  publishLabel,
  dashboardHref,
  dashboardHrefTemplate,
  dashboardLabel,
}: PublicPageHeaderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [academyId, setAcademyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/check")
      .then(async (r) => {
        if (!r.ok) {
          setIsAuthenticated(false);
          setAcademyId(null);
          return;
        }

        const payload = await r.json();
        const data = payload?.data ?? payload;
        setIsAuthenticated(Boolean(data.authenticated));
        setAcademyId(data.academyId ?? null);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setAcademyId(null);
      });
  }, []);

  const resolvedDashboardHref =
    academyId && dashboardHrefTemplate
      ? dashboardHrefTemplate.replace("{academyId}", academyId)
      : dashboardHref;
  const resolvedPublishHref =
    academyId && publishHrefTemplate
      ? publishHrefTemplate.replace("{academyId}", academyId)
      : publishHref;

  return (
    <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        {isAuthenticated && (
          <Button asChild variant="outline">
            <Link href={resolvedDashboardHref}>
              <ListOrdered className="mr-2 h-4 w-4" />
              {dashboardLabel}
            </Link>
          </Button>
        )}
        <Button asChild className="sm:w-auto">
          <Link href={resolvedPublishHref}>
            <Plus className="mr-2 h-4 w-4" />
            {publishLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
