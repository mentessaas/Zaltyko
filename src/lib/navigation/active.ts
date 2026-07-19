function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function matchPath(
  pathname: string | null | undefined,
  href: string,
  options?: {
    exact?: boolean;
    aliases?: string[];
  }
): boolean {
  if (!pathname) return false;

  const current = normalize(pathname);
  const target = normalize(href);
  const aliases = options?.aliases?.map(normalize) ?? [];

  if (current === target || aliases.includes(current)) {
    return true;
  }

  if (options?.exact) {
    return false;
  }

  return current.startsWith(`${target}/`);
}

export function isAcademyNavigationActive(
  pathname: string | null | undefined,
  href: string,
  academyId: string
): boolean {
  const dashboardHref = `/app/${academyId}/dashboard`;
  if (href === dashboardHref) {
    return matchPath(pathname, href, { exact: true });
  }

  return matchPath(pathname, href);
}

export function isGlobalNavigationActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (href === "/dashboard") {
    return matchPath(pathname, href, { aliases: ["/dashboard/"] });
  }

  if (href === "/dashboard/profile") {
    return matchPath(pathname, href);
  }

  return matchPath(pathname, href);
}

export function isSuperAdminNavigationActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (href === "/super-admin/dashboard") {
    return matchPath(pathname, href, { aliases: ["/super-admin"] });
  }

  return matchPath(pathname, href);
}

export function isPublicNavigationActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (href.startsWith("#")) {
    return pathname === "/";
  }

  return matchPath(pathname, href, { exact: true });
}
