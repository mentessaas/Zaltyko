"use client";

import * as React from "react";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center space-x-2 text-sm py-2", className)}>
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground transition-colors flex items-center"
        aria-label="Inicio"
      >
        <Home className="h-4 w-4" />
      </Link>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {item.href && index < items.length - 1 ? (
            <Link
              href={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span className={cn(
              "font-medium",
              index === items.length - 1 ? "text-foreground" : "text-muted-foreground"
            )}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

