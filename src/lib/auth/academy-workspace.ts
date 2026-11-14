import { ownerPathForLegacyAppSegment } from "@/lib/launch/legacy-app-redirects.mjs";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

export async function resolveAcademyWorkspaceUrl(args: {
  userId: string;
  email?: string | null;
  suffix?: string;
  fallbackPath?: string;
}): Promise<string> {
  const home = await resolveUserHome({
    userId: args.userId,
    email: args.email,
  });

  if (home.destination !== "academy_workspace" || !home.activeAcademyId) {
    return args.fallbackPath ?? home.redirectUrl;
  }

  // El panel /app se retiró: el sufijo antiguo se traduce a su equivalente en /owner.
  const firstSegment = args.suffix?.replace(/^\/+/, "").split("/")[0];
  return ownerPathForLegacyAppSegment(firstSegment);
}
