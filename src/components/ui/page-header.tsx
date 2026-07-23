"use client";

import { ReactNode } from "react";
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
  icon?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("zaltyko-motion-lines rounded-[24px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] lg:px-7 lg:py-6", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-4 flex items-center gap-2 text-sm">
          {breadcrumbs.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              {index > 0 && (
                <span className="text-zaltyko-text-secondary">/</span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-zaltyko-text-secondary transition-colors hover:text-zaltyko-teal"
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
            {icon && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zaltyko-teal/10 text-zaltyko-teal">
                {icon}
              </div>
            )}
            <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-zaltyko-navy sm:text-3xl">
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
