import { describe, expect, it } from "vitest";

import {
  classifyAthleteDocumentStorageReference,
  resolveAssessmentVideoStoragePath,
} from "@/lib/storage/storage-object-delete-guards";

const tenantId = "10000000-0000-4000-8000-000000000001";
const otherTenantId = "10000000-0000-4000-8000-000000000011";
const academyId = "20000000-0000-4000-8000-000000000002";
const otherAcademyId = "20000000-0000-4000-8000-000000000022";
const athleteId = "30000000-0000-4000-8000-000000000003";
const otherAthleteId = "30000000-0000-4000-8000-000000000033";
const assessmentId = "40000000-0000-4000-8000-000000000004";
const otherAssessmentId = "40000000-0000-4000-8000-000000000044";
const videoId = "50000000-0000-4000-8000-000000000005";
const otherVideoId = "50000000-0000-4000-8000-000000000055";
const storageOrigin = "https://project.supabase.co";
const generatedVideoFile = "1730000000000-abcdef0123456789abcdef01.mp4";

function videoKey(overrides: Partial<{
  tenantId: string;
  academyId: string;
  assessmentId: string;
  videoId: string;
}> = {}) {
  const prefix = [
    overrides.tenantId ?? tenantId,
    overrides.academyId ?? academyId,
    "assessment-videos",
    overrides.assessmentId ?? assessmentId,
    overrides.videoId ?? videoId,
  ].join("/");
  return `${prefix}/${generatedVideoFile}`;
}

function publicUrl(key: string, origin = storageOrigin) {
  return `${origin}/storage/v1/object/public/uploads/${key}`;
}

function resolveVideo(storedUrl: string, configuredSupabaseUrl = storageOrigin) {
  return resolveAssessmentVideoStoragePath({
    storedUrl,
    configuredSupabaseUrl,
    tenantId,
    academyId,
    assessmentId,
    videoId,
  });
}

describe("guardas de referencias de Storage", () => {
  it("acepta solo la ruta privada exacta del tenant, academia y atleta", () => {
    const path = `${tenantId}/${academyId}/athletes/${athleteId}/documents/1730000000000-abcdef0123456789abcdef01.pdf`;

    expect(classifyAthleteDocumentStorageReference(path, { tenantId, academyId, athleteId })).toEqual({
      kind: "private",
      path,
    });
  });

  it.each([
    ["tenant", `${otherTenantId}/${academyId}/athletes/${athleteId}/documents/file.pdf`],
    ["academia", `${tenantId}/${otherAcademyId}/athletes/${athleteId}/documents/file.pdf`],
    ["atleta", `${tenantId}/${academyId}/athletes/${otherAthleteId}/documents/file.pdf`],
  ])("rechaza una ruta de otro %s", (_scope, path) => {
    expect(classifyAthleteDocumentStorageReference(path, { tenantId, academyId, athleteId })).toEqual({
      kind: "invalid",
    });
  });

  it.each([
    `${tenantId}/${academyId}/athletes/${athleteId}/documents/../${otherAthleteId}/private.pdf`,
    `${tenantId}/${academyId}/athletes/${athleteId}/documents/%2e%2e/private.pdf`,
    `${tenantId}/${academyId}/athletes/${athleteId}/documents/folder\\private.pdf`,
    `${tenantId}/${academyId}/athletes/${athleteId}/documents//private.pdf`,
  ])("rechaza traversal o segmentos no seguros en documentos: %s", (path) => {
    expect(classifyAthleteDocumentStorageReference(path, { tenantId, academyId, athleteId })).toEqual({
      kind: "invalid",
    });
  });

  it("trata URLs HTTP(S) heredadas como metadata-only, sin extraer una clave", () => {
    expect(
      classifyAthleteDocumentStorageReference("https://legacy.example.invalid/file.pdf", {
        tenantId,
        academyId,
        athleteId,
      }),
    ).toEqual({ kind: "external" });
  });

  it("acepta el origen configurado y la clave ligada a tenant, academia, evaluación y fila", () => {
    expect(resolveVideo(publicUrl(videoKey()))).toBe(videoKey());
  });

  it.each([
    ["tenant", videoKey({ tenantId: otherTenantId })],
    ["academia", videoKey({ academyId: otherAcademyId })],
    ["evaluación", videoKey({ assessmentId: otherAssessmentId })],
    ["vídeo", videoKey({ videoId: otherVideoId })],
  ])("rechaza una clave ligada a otro %s", (_scope, key) => {
    expect(resolveVideo(publicUrl(key))).toBeNull();
  });

  it.each([
    publicUrl(videoKey(), "https://project.supabase.co.evil.invalid"),
    publicUrl(videoKey(), "https://project.supabase.co@evil.invalid"),
    `https://project.supabase.co/prefix/storage/v1/object/public/uploads/${videoKey()}`,
    `https://project.supabase.co/storage/v1/object/public/uploads.evil/${videoKey()}`,
    publicUrl([
      tenantId, academyId, "assessment-videos", "..", assessmentId, videoId, generatedVideoFile,
    ].join("/")),
    publicUrl([
      tenantId, academyId, "assessment-videos", "%2e%2e", assessmentId, videoId, generatedVideoFile,
    ].join("/")),
    `${publicUrl(videoKey())}?download=1`,
    `${publicUrl(videoKey())}#fragment`,
    "https://legacy.example.invalid/storage/v1/object/public/uploads/legacy-video.mp4",
  ])("rechaza origen, marcador o URL no canónica: %s", (storedUrl) => {
    expect(resolveVideo(storedUrl)).toBeNull();
  });

  it("falla cerrado si no hay origen configurado", () => {
    expect(resolveAssessmentVideoStoragePath({
      storedUrl: publicUrl(videoKey()),
      configuredSupabaseUrl: undefined,
      tenantId,
      academyId,
      assessmentId,
      videoId,
    })).toBeNull();
  });
});
