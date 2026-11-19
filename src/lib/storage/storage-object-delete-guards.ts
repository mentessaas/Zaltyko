const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,254}$/;
const GENERATED_VIDEO_FILE = /^\d+-[a-f0-9]{24}\.[a-z0-9]{1,10}$/;
const UPLOADS_PUBLIC_MARKER = "/storage/v1/object/public/uploads/";

export type AthleteDocumentStorageReference =
  | { kind: "private"; path: string }
  | { kind: "external" }
  | { kind: "invalid" };

export function classifyAthleteDocumentStorageReference(
  value: string,
  scope: { tenantId: string; academyId: string; athleteId: string }
): AthleteDocumentStorageReference {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:"
        ? { kind: "external" }
        : { kind: "invalid" };
    } catch {
      return { kind: "invalid" };
    }
  }

  if (
    !UUID_PATTERN.test(scope.tenantId) ||
    !UUID_PATTERN.test(scope.academyId) ||
    !UUID_PATTERN.test(scope.athleteId)
  ) {
    return { kind: "invalid" };
  }

  const expectedPrefix = `${scope.tenantId}/${scope.academyId}/athletes/${scope.athleteId}/documents/`;
  if (!value.startsWith(expectedPrefix)) return { kind: "invalid" };

  const relativePath = value.slice(expectedPrefix.length);
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    value.includes("\\") ||
    value.includes("%") ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || !SAFE_PATH_SEGMENT.test(segment)
    )
  ) {
    return { kind: "invalid" };
  }

  return { kind: "private", path: value };
}

export function resolveAssessmentVideoStoragePath(input: {
  storedUrl: string;
  configuredSupabaseUrl: string | undefined;
  tenantId: string;
  academyId: string;
  assessmentId: string;
  videoId: string;
}): string | null {
  const {
    storedUrl,
    configuredSupabaseUrl,
    tenantId,
    academyId,
    assessmentId,
    videoId,
  } = input;

  if (
    !configuredSupabaseUrl ||
    !UUID_PATTERN.test(tenantId) ||
    !UUID_PATTERN.test(academyId) ||
    !UUID_PATTERN.test(assessmentId) ||
    !UUID_PATTERN.test(videoId)
  ) {
    return null;
  }

  let configuredUrl: URL;
  let stored: URL;
  try {
    configuredUrl = new URL(configuredSupabaseUrl);
    stored = new URL(storedUrl);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(configuredUrl.protocol) ||
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.pathname !== "/" ||
    configuredUrl.search ||
    configuredUrl.hash ||
    stored.origin !== configuredUrl.origin ||
    stored.username ||
    stored.password ||
    stored.search ||
    stored.hash
  ) {
    return null;
  }

  // Generated upload keys contain only literal ASCII path characters. Reject
  // encoded separators/dots and URL-parser path normalization before trusting
  // the normalized pathname.
  const schemeEnd = storedUrl.indexOf("://");
  if (schemeEnd < 0) return null;
  const authorityAndPath = storedUrl.slice(schemeEnd + 3);
  const pathStart = authorityAndPath.indexOf("/");
  if (pathStart < 0) return null;
  const rawPath = authorityAndPath.slice(pathStart);
  if (
    rawPath.includes("?") ||
    rawPath.includes("#") ||
    rawPath.includes("\\") ||
    rawPath.includes("%") ||
    rawPath !== stored.pathname ||
    !rawPath.startsWith(UPLOADS_PUBLIC_MARKER)
  ) {
    return null;
  }

  const objectKey = rawPath.slice(UPLOADS_PUBLIC_MARKER.length);
  const expectedPrefix = `${tenantId}/${academyId}/assessment-videos/${assessmentId}/${videoId}/`;
  if (!objectKey.startsWith(expectedPrefix)) return null;

  const fileName = objectKey.slice(expectedPrefix.length);
  if (!GENERATED_VIDEO_FILE.test(fileName)) return null;

  return objectKey;
}
