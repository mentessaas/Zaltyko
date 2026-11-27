"use client";

import { useEffect, useRef, useState } from "react";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { ANIMATION_FLAGS, ANIMATION_JOINTS, type ElementAnimationData } from "./types";
import { renderAnimationFrame, renderPosterSvg } from "./renderer";

const SCENES = ["floor", "floor_pass", "beam", "beam_mount", "beam_side_dismount", "high_bar", "uneven_bars", "rings", "parallel_bars", "pommel_horse", "vault"];
const FRAME_LENGTH = ANIMATION_JOINTS.length * 2 + ANIMATION_FLAGS.length;
// the apparatus drawing is injected as SVG: only plain shapes in currentColor, never scripts, links or handlers
const UNSAFE_SCENE_SVG = /<script|on[a-z]+=|href|url\(|#[0-9a-f]{3}/i;

function validAnimation(value: unknown): value is ElementAnimationData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ElementAnimationData>;
  return data.formatVersion === 2 && data.fps === 30 && data.jointEncoding === "delta" &&
    Array.isArray(data.joints) && data.joints.join() === ANIMATION_JOINTS.join() &&
    Array.isArray(data.flags) && data.flags.join() === ANIMATION_FLAGS.join() &&
    typeof data.sceneSvg === "string" && data.sceneSvg.length <= 4000 && !UNSAFE_SCENE_SVG.test(data.sceneSvg) &&
    (data.rings === null || (Array.isArray(data.rings) && data.rings.length === 1 && Number.isFinite(data.rings[0]))) &&
    Array.isArray(data.frames) && data.frames.length > 0 && data.frames.length <= 600 &&
    data.frames.every((frame) => Array.isArray(frame) && frame.length === FRAME_LENGTH && frame.every(Number.isSafeInteger)) &&
    Array.isArray(data.size) && data.size.length === 2 && data.size.every((size) => Number.isFinite(size) && size > 0 && size <= 1000) &&
    typeof data.floorY === "number" && Number.isFinite(data.floorY) && typeof data.headroom === "number" && Number.isInteger(data.headroom) &&
    typeof data.floorBand === "boolean" && !!data.poster && Number.isInteger(data.poster.main) && data.poster.main >= 0 && data.poster.main < data.frames.length &&
    Array.isArray(data.poster.ghosts) && data.poster.ghosts.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < data.frames!.length) &&
    typeof data.scene === "string" && SCENES.includes(data.scene);
}

export function ElementAnimation({ elementId, edition, elementKey, organizationId, locationId }: {
  elementId: string;
  edition: string;
  elementKey: string;
  organizationId: string;
  locationId: string;
}) {
  const container = useRef<HTMLElement>(null);
  const [data, setData] = useState<ElementAnimationData | null>(null);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ organizationId, locationId });
    void fetch(`/api/v1/owner/element-library/${encodeURIComponent(elementId)}/animation?${query}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: unknown) => {
        const candidate = result && typeof result === "object" && "data" in result ? result.data : null;
        if (live && validAnimation(candidate) && candidate.edition === edition && candidate.elementKey === elementKey) setData(candidate);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [elementId, edition, elementKey, organizationId, locationId]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!data) return;
    const target = container.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (!data || reducedMotion || !playing || !visible) return;
    let request = 0;
    let previous = 0;
    let elapsed = 0;
    const tick = (time: number) => {
      if (!previous) previous = time;
      elapsed += time - previous;
      previous = time;
      const frameDuration = 1000 / data.fps;
      if (elapsed >= frameDuration) {
        setFrameIndex((current) => (current + Math.floor(elapsed / frameDuration)) % data.frames.length);
        elapsed %= frameDuration;
      }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [data, playing, reducedMotion, visible]);

  if (!data) return null;
  const staticSvg = renderPosterSvg(data);
  const frameSvg = renderAnimationFrame(data, frameIndex);
  const svg = reducedMotion ? staticSvg : frameSvg;
  return (
    <section ref={container} className="grid gap-2" aria-label="Animación propia del elemento">
      <div className={`${ownerUi.card} overflow-hidden p-2 text-z-ink`}>
        <div className="mx-auto max-w-md" role="img" aria-label={reducedMotion ? "Pictograma fijo del elemento" : "Animación del elemento"} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {!reducedMotion ? (
        <button type="button" className={`${ownerUi.secondaryButton} justify-self-start`} onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
          {playing ? "Pausar animación" : "Reproducir animación"}
        </button>
      ) : <p className={ownerUi.help}>Pictograma fijo porque está activada la opción de reducir movimiento.</p>}
      <p className={ownerUi.help}>Dibujos y animaciones propios de Zaltyko, basados en la técnica del elemento. No reproducen los dibujos del Código de Puntuación.</p>
    </section>
  );
}
