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

  const trimmedSuffix = args.suffix?.replace(/^\/+/, "") ?? "dashboard";
  return `/app/${home.activeAcademyId}/${trimmedSuffix}`;
}
