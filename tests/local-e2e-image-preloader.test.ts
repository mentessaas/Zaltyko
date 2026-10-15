import { describe, expect, it, vi } from "vitest";

import {
  preloadLocalE2eImages,
  sanitizeDockerPullStderr,
} from "../scripts/lib/local-e2e-image-preloader";
import { REQUIRED_LOCAL_SUPABASE_IMAGES } from "../scripts/lib/local-e2e-preflight";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";

describe("GitHub Actions local Supabase image preloader", () => {
  it("maps every CLI image to an exact fallback pin without additions", () => {
    expect(LOCAL_E2E_DIGEST_PINS.map((pin) => pin.ecr)).toEqual(
      REQUIRED_LOCAL_SUPABASE_IMAGES
    );
  });

  it("wires quota fallback through the same filtered Docker environment", async () => {
    const pin = LOCAL_E2E_DIGEST_PINS[0];
    const hubRef = `docker.io/${pin.hub}@${pin.manifest}`;
    const identity = JSON.stringify([
      {
        Os: "linux",
        Architecture: "amd64",
        Id: pin.config,
        RepoDigests: [`${pin.hub}@${pin.manifest}`],
      },
    ]);
    const commands: string[][] = [];
    const environments: NodeJS.ProcessEnv[] = [];
    let tagged = false;
    await preloadLocalE2eImages(
      {
        GITHUB_ACTIONS: "true",
        DOCKER_HOST: "unix:///var/run/docker.sock",
        AWS_SECRET_ACCESS_KEY: "synthetic-not-forwarded",
        STRIPE_SECRET_KEY: "synthetic-not-forwarded",
      },
      async (args, env, timeoutMs) => {
        commands.push(args);
        environments.push(env);
        expect(timeoutMs).toBeGreaterThan(0);
        expect(timeoutMs).toBeLessThanOrEqual(600_000);
        if (args[0] === "info")
          return { status: 0, stdout: "27.5.1", stderr: "" };
        if (args[0] === "pull" && args.includes(pin.ecr)) {
          return { status: 1, stdout: "", stderr: "toomanyrequests: 429" };
        }
        if (args[1] === "tag") tagged = true;
        if (args[1] === "inspect" && args[2] === pin.ecr && !tagged) {
          return { status: 1, stdout: "", stderr: "absent" };
        }
        return { status: 0, stdout: identity, stderr: "" };
      }
    );
    expect(commands.filter(([op]) => op === "pull")).toEqual([
      ["pull", "--platform", "linux/amd64", pin.ecr],
      ["pull", "--platform", "linux/amd64", hubRef],
    ]);
    expect(commands).toContainEqual(["image", "tag", pin.config, pin.ecr]);
    expect(
      environments.every(
        (env) =>
          env.DOCKER_HOST === "unix:///var/run/docker.sock" &&
          env.AWS_SECRET_ACCESS_KEY === undefined &&
          env.STRIPE_SECRET_KEY === undefined
      )
    ).toBe(true);
  });

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
      REQUIRED_LOCAL_SUPABASE_IMAGES.slice(1).map((image) => [
        "pull",
        "--platform",
        "linux/amd64",
        image,
      ])
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

  it("redacts auth, token values, and URL credentials and queries", () => {
    const sanitized = sanitizeDockerPullStderr(
      [
        "Authorization: Bearer header-secret",
        "proxy-authorization=Basic proxy-secret",
        "token=assignment-secret password=quoted-secret",
        "registry https://reader:url-secret@registry.example/v2/repo/manifests/tag?X-Amz-Credential=signed-secret&X-Amz-Signature=signature-secret",
        "provider token ghp_123456789012345678901234567890123456",
      ].join("\n")
    );

    expect(sanitized).toBe(
      "Diagnostic indicators: unclassified. Raw stderr omitted."
    );
    for (const secret of [
      "header-secret",
      "proxy-secret",
      "assignment-secret",
      "quoted-secret",
      "reader",
      "url-secret",
      "X-Amz-Credential",
      "signed-secret",
      "X-Amz-Signature",
      "signature-secret",
      "ghp_123456789012345678901234567890123456",
    ]) {
      expect(sanitized).not.toContain(secret);
    }
    expect(sanitized).not.toContain("?");
  });

  it("omits long unclassified stderr entirely", () => {
    const sanitized = sanitizeDockerPullStderr(
      `${"x".repeat(2_500)}last-error`
    );

    expect(sanitized.length).toBeLessThanOrEqual(2_100);
    expect(sanitized).toBe(
      "Diagnostic indicators: unclassified. Raw stderr omitted."
    );
    expect(sanitized).not.toContain("last-error");
  });

  it.each([
    ["toomanyrequests: 429", "rate-limit"],
    ["unauthorized: 401", "authentication-or-permission"],
    ["no matching manifest for linux/amd64", "manifest-or-platform"],
    ["no space left on device", "disk-space"],
    ["context deadline exceeded", "timeout"],
    ["connection reset by peer", "network-or-registry"],
  ])("classifies %s without exposing arbitrary text", (detail, expected) => {
    expect(
      sanitizeDockerPullStderr(
        `${detail} Bearer sensitive-value https://registry.example/private-secret {\"token\":\"json-secret\"}`
      )
    ).toBe(`Diagnostic indicators: ${expected}. Raw stderr omitted.`);
  });

  it("handles empty stderr without echoing input", () => {
    expect(sanitizeDockerPullStderr("  ")).toBe(
      "No stderr output was captured."
    );
  });

  it("reports the pull status and sanitized stderr when image preload fails", async () => {
    const secretUrl =
      "https://user:password@registry.example/v2/repo/manifests/tag?token=query-secret";
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === "info") {
        return { status: 0, stdout: "27.5.1", stderr: "" };
      }
      if (args[0] === "image") {
        return { status: 1, stdout: "", stderr: "not present" };
      }
      return {
        status: 17,
        stdout: "",
        stderr: `pull failed: ${secretUrl}\nAuthorization: Bearer pull-secret`,
      };
    });

    let error: unknown;
    try {
      await preloadLocalE2eImages(
        { GITHUB_ACTIONS: "true", DOCKER_HOST: "unix:///var/run/docker.sock" },
        run
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(
      /public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.095 \(docker pull exit status 17\)/
    );
    expect(message).toContain("Raw stderr omitted.");
    expect(message).not.toContain("registry.example");
    expect(message).not.toContain("pull-secret");
    expect(message).not.toContain("query-secret");
    expect(message).not.toContain("user:password");
    expect(run).toHaveBeenCalledTimes(3);
  });
});
