import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type DockerContextMetadata = {
  Name?: string;
  Endpoints?: { docker?: { Host?: string } };
};

export type DockerEndpointInput = {
  dockerHost?: string;
  dockerContext?: string;
  dockerConfig?: string;
  home?: string;
};

function contextEndpoint(configDirectory: string, name: string): string {
  if (name === "default") return "unix:///var/run/docker.sock";
  const metadataDirectory = join(configDirectory, "contexts", "meta");
  if (!existsSync(metadataDirectory)) return "";
  for (const entry of readdirSync(metadataDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metadataPath = join(metadataDirectory, entry.name, "meta.json");
    if (!existsSync(metadataPath)) continue;
    const metadata = JSON.parse(
      readFileSync(metadataPath, "utf8")
    ) as DockerContextMetadata;
    if (metadata.Name === name) return metadata.Endpoints?.docker?.Host ?? "";
  }
  return "";
}

function ensureLocalUnixEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(
      "Docker endpoint is invalid; only a local Unix socket is allowed."
    );
  }
  if (
    parsed.protocol !== "unix:" ||
    parsed.host !== "" ||
    !parsed.pathname.startsWith("/") ||
    parsed.pathname.split("/").includes("..") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Docker endpoint is not a local Unix socket; refusing to connect."
    );
  }
  return endpoint;
}

/** Resolve Docker's active endpoint without echoing context paths or credentials. */
export function resolveLocalDockerEndpoint(input: DockerEndpointInput): string {
  const configDirectory =
    input.dockerConfig ?? join(input.home ?? homedir(), ".docker");
  const configPath = join(configDirectory, "config.json");
  let currentContext = "default";
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      currentContext?: string;
    };
    currentContext = config.currentContext || "default";
  }

  // Docker honors DOCKER_CONTEXT over DOCKER_HOST. The runner later removes
  // both inherited selectors and pins DOCKER_HOST to this validated socket.
  const selectedContext = input.dockerContext || currentContext;
  const endpoint = input.dockerContext
    ? contextEndpoint(configDirectory, selectedContext)
    : input.dockerHost || contextEndpoint(configDirectory, selectedContext);
  if (!endpoint) {
    throw new Error(
      "Could not resolve the active Docker context; refusing to connect."
    );
  }
  return ensureLocalUnixEndpoint(endpoint);
}
