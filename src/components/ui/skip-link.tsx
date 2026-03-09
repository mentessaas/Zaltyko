"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkipLinkProps {
  /** The target element ID to skip to (usually main content) */
  href: string;
  /** Text to display when visible */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * SkipLink component - Provides keyboard-accessible skip navigation
 *
 * @example
 * ```tsx
 * <SkipLink href="#main-content">Saltar al contenido principal</SkipLink>
 * ```
 *
 * WCAG 2.1 Success Criterion 2.4.1 (Bypass Blocks)
 * Allows keyboard users to skip repetitive navigation elements
 */
export function SkipLink({ href, children, className }: SkipLinkProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      // Set focus on the target element
      target.setAttribute("tabindex", "-1");
      (target as HTMLElement).focus();

      // Scroll to the element
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        // Base styles - visually hidden by default
        "fixed left-4 top-4 z-[100] translate-y-[-100vh] rounded-lg bg-zaltyko-primary px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform duration-200",
        // Show when focused
        "focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-zaltyko-primary focus:ring-offset-2",
        // Always show when keyboard is being used
        "peer-focus:translate-y-4",
        className
      )}
    >
      {children}
    </a>
  );
}

export default SkipLink;
