#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const required = ["E2E_ACADEMY_ID", "E2E_USER_ID", "E2E_PROFILE_ID", "E2E_TENANT_ID", "E2E_ACADEMY_NAME", "INTERNAL_AUTH_SECRET", "E2E_STORAGE_STATE"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required E2E variables: ${missing.join(", ")}`);
  process.exit(2);
}
const payload = {
  userId: process.env.E2E_USER_ID,
  profileId: process.env.E2E_PROFILE_ID,
  tenantId: process.env.E2E_TENANT_ID,
  academyId: process.env.E2E_ACADEMY_ID,
  academyName: process.env.E2E_ACADEMY_NAME,
  sessionId: process.env.E2E_SESSION_ID ?? "e2e-local-dev-session",
};
const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
const signature = createHmac("sha256", process.env.INTERNAL_AUTH_SECRET).update(encoded).digest("hex");
const value = `${encoded}.${signature}`;
const output = resolve(process.env.E2E_STORAGE_STATE);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ cookies: [
  { name: "zaltyko_dev_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  { name: "zaltyko_dev_session", value, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
], origins: [] }, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ output, academyId: payload.academyId, cookieCount: 2 }));
