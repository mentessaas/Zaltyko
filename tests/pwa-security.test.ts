import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("PWA security contracts", () => {
  it("never caches API responses or replays background mutations", () => {
    const swPath = fileURLToPath(new URL("../public/sw.js", import.meta.url));
    const source = readFileSync(swPath, "utf8");

    expect(source).not.toContain("API_CACHE");
    expect(source).not.toContain("pendingOperations");
    expect(source).not.toContain("addEventListener('sync'");
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain("event.respondWith(fetch(request))");
  });

  it("keeps the application-level offline mutation queue disabled", () => {
    const queuePath = fileURLToPath(
      new URL("../src/lib/offline/operations-queue.ts", import.meta.url)
    );
    const source = readFileSync(queuePath, "utf8");

    expect(source).toContain("OFFLINE_MUTATIONS_ENABLED = false");
    expect(source).toContain("Offline mutations are disabled");
  });

  it("does not advertise legacy shortcuts or a missing share endpoint", () => {
    const manifestPath = fileURLToPath(new URL("../public/manifest.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.shortcuts).toEqual([]);
    expect(manifest.share_target).toBeUndefined();
  });
});
