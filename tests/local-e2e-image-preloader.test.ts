import { describe, expect, it, vi } from "vitest";

import { preloadLocalE2eImages } from "../scripts/lib/local-e2e-image-preloader";
import { REQUIRED_LOCAL_SUPABASE_IMAGES } from "../scripts/lib/local-e2e-preflight";

describe("GitHub Actions local Supabase image preloader", () => {
  it("refuses to execute outside GitHub Actions without invoking Docker", async () => {
    const run = vi.fn();

    await expect(preloadLocalE2eImages({}, run)).rejects.toThrow(
      "restricted to GitHub Actions"
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("validates the local daemon and pulls only missing manifest images", async () => {
    const commands: string[][] = [];
    const run = vi.fn(async (args: string[]) => {
      commands.push(args);
      if (args[0] === "info") {
        return { status: 0, stdout: "27.5.1", stderr: "" };
      }
      if (args[0] === "image") {
        return {
          status: args[2] === REQUIRED_LOCAL_SUPABASE_IMAGES[0] ? 0 : 1,
          stdout: "",
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    });

    await preloadLocalE2eImages(
      { GITHUB_ACTIONS: "true", DOCKER_HOST: "unix:///var/run/docker.sock" },
      run
    );

    expect(commands[0]).toEqual(["info", "--format", "{{.ServerVersion}}"]);
    expect(commands.filter(([command]) => command === "pull")).toEqual(
      REQUIRED_LOCAL_SUPABASE_IMAGES.slice(1).map((image) => ["pull", image])
    );
    expect(commands.some((args) => args.includes("latest"))).toBe(false);
  });

  it("stops when the Docker daemon is unavailable", async () => {
    const run = vi.fn(async () => ({ status: 1, stdout: "", stderr: "" }));

    await expect(
      preloadLocalE2eImages(
        { GITHUB_ACTIONS: "true", DOCKER_HOST: "unix:///var/run/docker.sock" },
        run
      )
    ).rejects.toThrow("local Docker daemon is unavailable");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
