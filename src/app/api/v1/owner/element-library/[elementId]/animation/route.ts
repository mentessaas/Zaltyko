import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalogElement } from "@/modules/element-library/application/element-library-service";
import { ELEMENT_LIBRARY_ANIMATIONS_ENV_FLAG } from "@/modules/element-library/animation/config";
import { ANIMATION_FLAGS, ANIMATION_JOINTS } from "@/modules/element-library/animation/types";
import { catalogElementQuerySchema } from "@/modules/element-library/domain/library-requests";

import {
  apiSuccess,
  invalidInput,
  libraryUnauthenticated,
  noStore,
  progressError,
  resolveLibraryActor,
} from "@/app/api/v1/owner/element-library-http";

const paramsSchema = z.object({ elementId: z.guid() }).strict();
const FRAME_LENGTH = ANIMATION_JOINTS.length * 2 + ANIMATION_FLAGS.length;
const frameSchema = z.array(z.number().int().min(-3600).max(3600)).length(FRAME_LENGTH);
const animationSchema = z.object({
  formatVersion: z.literal(2),
  edition: z.string(),
  elementKey: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  scene: z.enum(["floor", "floor_pass", "beam", "beam_mount", "beam_side_dismount", "high_bar", "uneven_bars", "rings", "parallel_bars", "pommel_horse", "vault"]),
  fps: z.literal(30),
  size: z.tuple([z.number().positive().max(1000), z.number().positive().max(1000)]),
  floorY: z.number().finite().min(0).max(1000),
  headroom: z.number().int().nonnegative(),
  floorBand: z.boolean(),
  // exported by scripts/element-library/animation/export_app.py from scenes.py: plain shapes in currentColor only
  sceneSvg: z.string().max(4000).refine((value) => !/<script|on[a-z]+=|href|url\(|#[0-9a-f]{3}/i.test(value), "Scene drawing is not plain SVG shapes."),
  rings: z.tuple([z.number().finite()]).nullable(),
  joints: z.array(z.string()).refine((value) => value.join() === ANIMATION_JOINTS.join(), "Unknown joint layout."),
  jointEncoding: z.literal("delta"),
  flags: z.array(z.string()).refine((value) => value.join() === ANIMATION_FLAGS.join(), "Unknown flag layout."),
  poster: z.object({ main: z.number().int().nonnegative(), ghosts: z.array(z.number().int().nonnegative()) }).strict(),
  frames: z.array(frameSchema).min(1).max(600),
}).strict().superRefine((data, context) => {
  if (data.poster.main >= data.frames.length || data.poster.ghosts.some((index) => index >= data.frames.length)) {
    context.addIssue({ code: "custom", message: "Poster frame indexes are out of range." });
  }
});

// @auth-flexible route-guard-reason: cookie session read; the existing library scope admits only authorized academy staff; getCatalogElement rechecks membership, role, site and element visibility before the animation file is loaded.
export async function GET(request: Request, context: { params: Promise<{ elementId: string }> }) {
  if (process.env[ELEMENT_LIBRARY_ANIMATIONS_ENV_FLAG] !== "true") {
    return noStore(invalidInput("La animación no está disponible.", "element-animation-unavailable"));
  }
  const user = await getCurrentUser(request);
  if (!user) return libraryUnauthenticated();
  const params = paramsSchema.safeParse(await context.params);
  const query = catalogElementQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) {
    return invalidInput("Indica la academia, la sede y el elemento.", "invalid-element-animation-query");
  }
  try {
    const resolved = await resolveLibraryActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    const card = await getCatalogElement({ actor: resolved.actor, elementId: params.data.elementId, query: query.data });
    const baseDir = path.resolve(process.cwd(), "src/modules/element-library/data");
    const animationPath = path.resolve(baseDir, card.edition.code, "animaciones", `${card.elementKey}.json`);
    if (!animationPath.startsWith(`${baseDir}${path.sep}`)) {
      return invalidInput("La animación no está disponible.", "element-animation-unavailable");
    }
    const parsed = animationSchema.safeParse(JSON.parse(await readFile(animationPath, "utf8")));
    if (!parsed.success || parsed.data.edition !== card.edition.code || parsed.data.elementKey !== card.elementKey) {
      return invalidInput("La animación no está disponible.", "element-animation-unavailable");
    }
    return noStore(apiSuccess(parsed.data));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return invalidInput("La animación no está disponible.", "element-animation-unavailable");
    }
    return progressError(error);
  }
}
