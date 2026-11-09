// Next.js resolves middleware beside the `src/app` directory. Keep the
// implementation in the repository root for backwards-compatible imports and
// re-export it here so production builds include the auth/rate-limit gates.
export { middleware } from "../middleware";

export const config = {
  matcher: [
    // Every API path runs through middleware, even one ending in an image
    // extension (/api/products/x.png): the launch cut, rate limits and auth
    // gates must not be skippable by a file-like suffix.
    "/api/:path*",
    // Pages and assets: skip static files and images outside /api.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// The existing middleware uses Node's crypto implementation for JWT checks.
// Keep it on the Node runtime so the production auth gate does not execute
// an incompatible Edge bundle.
export const runtime = "nodejs";
