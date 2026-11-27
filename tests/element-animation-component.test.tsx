// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ElementAnimation } from "@/modules/element-library/animation/ElementAnimation";
import { ANIMATION_FLAGS, ANIMATION_JOINTS, type ElementAnimationData } from "@/modules/element-library/animation/types";

const data: ElementAnimationData = {
  formatVersion: 2,
  edition: "fig-wag-2025-2028",
  elementKey: "fx_sample",
  scene: "floor",
  fps: 30,
  size: [360, 300],
  floorY: 268,
  headroom: 0,
  floorBand: false,
  sceneSvg: '<line x1="14" y1="268" x2="346" y2="268" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>',
  rings: null,
  joints: [...ANIMATION_JOINTS],
  jointEncoding: "delta",
  flags: [...ANIMATION_FLAGS],
  poster: { main: 0, ghosts: [] },
  frames: [Array.from({ length: ANIMATION_JOINTS.length * 2 + ANIMATION_FLAGS.length }, (_, index) => (index < ANIMATION_JOINTS.length * 2 ? 150 + index : 0))],
};

const originalMatchMedia = window.matchMedia;
const observerState = { constructed: 0, observed: 0, visible: false };

function setup({ reducedMotion, visible, payload = data }: { reducedMotion: boolean; visible: boolean; payload?: ElementAnimationData }) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  class TestIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) { observerState.constructed += 1; }
    observe(target: Element) {
      observerState.observed += 1;
      observerState.visible = visible;
      this.callback([{ isIntersecting: visible, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
  }
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: payload }) }));
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  render(<ElementAnimation elementId="element-id" edition={data.edition} elementKey={data.elementKey} organizationId="org-id" locationId="location-id" />);
  return { requestAnimationFrame, cancelAnimationFrame };
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  observerState.constructed = 0;
  observerState.observed = 0;
  observerState.visible = false;
});

describe("ElementAnimation", () => {
  it("renders the fixed pictogram and no playback control when reduced motion is preferred", async () => {
    const { requestAnimationFrame } = setup({ reducedMotion: true, visible: true });

    expect(await screen.findByLabelText("Pictograma fijo del elemento")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("starts only while visible and exposes an accessible playback toggle", async () => {
    const { requestAnimationFrame } = setup({ reducedMotion: false, visible: true });

    expect(await screen.findByLabelText("Animación del elemento")).toBeTruthy();
    expect(observerState).toEqual({ constructed: 1, observed: 1, visible: true });
    await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Pausar animación" }));
    expect(screen.getByRole("button", { name: "Reproducir animación" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("does not schedule frames while outside the viewport", async () => {
    const { requestAnimationFrame } = setup({ reducedMotion: false, visible: false });

    expect(await screen.findByLabelText("Animación del elemento")).toBeTruthy();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("ignores an animation whose apparatus drawing is not plain SVG shapes", async () => {
    setup({ reducedMotion: false, visible: true, payload: { ...data, sceneSvg: '<g onload="alert(1)"/>' } });

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Animación del elemento")).toBeNull();
  });
});
