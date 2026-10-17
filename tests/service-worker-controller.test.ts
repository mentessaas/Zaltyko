import { describe, expect, it, vi } from "vitest";

import {
  createControllerChangeHandler,
  listenForControllerChange,
} from "@/lib/service-worker-controller";

describe("service worker controller changes", () => {
  it("does not reload on first control or an unrequested controller change", () => {
    let acceptedUpdate = false;
    const reload = vi.fn(() => {
      acceptedUpdate = false;
    });
    const handleChange = createControllerChangeHandler({
      initialHasController: false,
      shouldReload: () => acceptedUpdate,
      reload,
    });

    handleChange();
    handleChange();

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once after the user accepts an update", () => {
    let acceptedUpdate = false;
    const reload = vi.fn(() => {
      acceptedUpdate = false;
    });
    const handleChange = createControllerChangeHandler({
      initialHasController: true,
      shouldReload: () => acceptedUpdate,
      reload,
    });

    acceptedUpdate = true;
    handleChange();
    handleChange();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("removes the controller listener during effect cleanup", () => {
    const target = new EventTarget();
    const serviceWorker = target as Pick<
      ServiceWorkerContainer,
      "addEventListener" | "removeEventListener"
    >;
    const handleChange = vi.fn();
    const cleanup = listenForControllerChange(serviceWorker, handleChange);

    cleanup();
    target.dispatchEvent(new Event("controllerchange"));

    expect(handleChange).not.toHaveBeenCalled();
  });
});
