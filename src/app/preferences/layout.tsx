import type { Metadata } from "next";
import type { ReactNode } from "react";

// Personal email-preferences screen: never a search result.
// The page is a client component, so the robots directive lives in this
// pass-through layout (SEO, 2026-11-12).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NoIndexLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
