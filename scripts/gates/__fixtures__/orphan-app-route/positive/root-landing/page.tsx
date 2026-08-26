// Positive: root landing page (src/app/app/page.tsx shape) is whitelisted.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/auth/check", { credentials: "include" })
      .then((r) => (r.ok ? router.replace("/app/123/dashboard") : null));
  }, [router]);
  return null;
}
