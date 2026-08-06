// Next.js resolves middleware beside the `src/app` directory. Keep the
// implementation in the repository root for backwards-compatible imports and
// re-export it here so production builds include the auth/rate-limit gates.
export { middleware } from "../middleware";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// The existing middleware uses Node's crypto implementation for JWT checks.
// Keep it on the Node runtime so the production auth gate does not execute
// an incompatible Edge bundle.
export const runtime = "nodejs";
