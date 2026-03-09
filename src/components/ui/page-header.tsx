"use client";

import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  icon: Icon,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm">
          {breadcrumbs.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-zaltyko-text-secondary">/</span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-zaltyko-text-secondary hover:text-zaltyko-primary transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-zaltyko-text-secondary">{item.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Title Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
              {title}
            </h1>
          </div>
          {description && (
            <p className="max-w-2xl text-sm text-zaltyko-text-secondary">
              {description}
            </p>
          )}
        </div>

        {/* Actions */}
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
