import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocalDockerEndpoint } from "../scripts/lib/local-docker-endpoint";

function makeConfig(
  currentContext: string,
  contexts: Array<{ name: string; endpoint: string }> = []
) {
  const directory = mkdtempSync(join(tmpdir(), "local-docker-endpoint-"));
  writeFileSync(
    join(directory, "config.json"),
    JSON.stringify({ currentContext })
  );
  for (const [index, context] of contexts.entries()) {
    const metadataDirectory = join(
      directory,
      "contexts",
      "meta",
      `context-${index}`
    );
    mkdirSync(metadataDirectory, { recursive: true });
    writeFileSync(
      join(metadataDirectory, "meta.json"),
      JSON.stringify({
        Name: context.name,
        Endpoints: { docker: { Host: context.endpoint } },
      })
    );
  }
  return directory;
}

describe("Docker local endpoint guard", () => {
  it("accepts an explicit local DOCKER_HOST even when config has another context", () => {
    const dockerConfig = makeConfig("remote", [
      { name: "remote", endpoint: "ssh://example.invalid" },
    ]);
    try {
      expect(
        resolveLocalDockerEndpoint({
          dockerConfig,
          dockerHost: "unix:///var/run/docker.sock",
        })
      ).toBe("unix:///var/run/docker.sock");
    } finally {
      rmSync(dockerConfig, { recursive: true, force: true });
    }
  });

  it("resolves a local Unix socket from the active context metadata", () => {
    const dockerConfig = makeConfig("desktop-local", [
      {
        name: "desktop-local",
        endpoint: "unix:///Users/test/.docker/run/docker.sock",
      },
    ]);
    try {
      expect(resolveLocalDockerEndpoint({ dockerConfig })).toBe(
        "unix:///Users/test/.docker/run/docker.sock"
      );
    } finally {
      rmSync(dockerConfig, { recursive: true, force: true });
    }
  });

  it.each([
    "tcp://192.0.2.1:2376",
    "ssh://user:secret@example.invalid",
    "unix://remote-host/var/run/docker.sock",
  ])("rejects a non-local endpoint without echoing its value", (endpoint) => {
    const dockerConfig = makeConfig("default");
    try {
      let errorMessage = "";
      try {
        resolveLocalDockerEndpoint({ dockerConfig, dockerHost: endpoint });
      } catch (error) {
        errorMessage = (error as Error).message;
      }
      expect(errorMessage).toContain("local Unix socket");
      expect(errorMessage).not.toContain("secret");
    } finally {
      rmSync(dockerConfig, { recursive: true, force: true });
    }
  });

  it("honors DOCKER_CONTEXT precedence and rejects its remote endpoint", () => {
    const dockerConfig = makeConfig("default", [
      { name: "remote", endpoint: "tcp://192.0.2.2:2376" },
    ]);
    try {
      expect(() =>
        resolveLocalDockerEndpoint({
          dockerConfig,
          dockerHost: "unix:///var/run/docker.sock",
          dockerContext: "remote",
        })
      ).toThrow("local Unix socket");
    } finally {
      rmSync(dockerConfig, { recursive: true, force: true });
    }
  });
});
