import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function pngSize(relativePath: string) {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const file = readFileSync(path);
  expect(file.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bytes: file.byteLength,
  };
}

describe("brand asset contract", () => {
  it("keeps mobile and PWA assets branded, sized, and non-placeholder", () => {
    expect(pngSize("mobile/assets/icon.png")).toMatchObject({ width: 1024, height: 1024 });
    expect(pngSize("mobile/assets/adaptive-icon.png")).toMatchObject({ width: 1024, height: 1024 });
    expect(pngSize("mobile/assets/splash.png")).toMatchObject({ width: 1284, height: 2778 });
    expect(pngSize("mobile/assets/notification-icon.png")).toMatchObject({ width: 96, height: 96 });
    expect(pngSize("mobile/assets/favicon.png")).toMatchObject({ width: 48, height: 48 });

    for (const asset of [
      "mobile/assets/icon.png",
      "mobile/assets/adaptive-icon.png",
      "mobile/assets/splash.png",
      "mobile/assets/notification-icon.png",
      "mobile/assets/favicon.png",
    ]) {
      expect(statSync(`${root}${asset}`).size, asset).toBeGreaterThan(1000);
    }
  });

  it("uses real asset paths in the manifest and push fallbacks", () => {
    const manifest = JSON.parse(readFileSync(`${root}public/manifest.json`, "utf8")) as {
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.background_color).toBe("#0F172A");
    expect(manifest.theme_color).toBe("#0F172A");
    for (const icon of manifest.icons) {
      expect(statSync(`${root}public${icon.src}`)).toBeTruthy();
    }

    const source = readFileSync(`${root}src/hooks/use-push-notifications.ts`, "utf8");
    expect(source).toContain('/icons/icon-192.png');
    expect(source).not.toContain("icon-192x192.png");
  });
});
