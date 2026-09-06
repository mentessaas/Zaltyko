import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  buckets: new Map<string, Array<{ member: string; score: number }>>(),
  insert: vi.fn(() => ({
    values: vi.fn(async () => []),
  })),
}));

vi.mock("@/db", () => ({ db: { insert: state.insert } }));
vi.mock("@/db/schema", () => ({ emailLogs: {} }));

vi.mock("@vercel/kv", () => ({
  kv: {
    zremrangebyscore: vi.fn(async (key: string, _min: number, max: number) => {
      const bucket = state.buckets.get(key) ?? [];
      state.buckets.set(
        key,
        bucket.filter((entry) => entry.score > max)
      );
    }),
    zcard: vi.fn(async (key: string) => state.buckets.get(key)?.length ?? 0),
    zrange: vi.fn(async (key: string) => {
      const first = state.buckets.get(key)?.[0];
      return first ? [first.member, first.score] : [];
    }),
    zadd: vi.fn(
      async (key: string, entry: { score: number; member: string }) => {
        const bucket = state.buckets.get(key) ?? [];
        bucket.push(entry);
        state.buckets.set(key, bucket);
      }
    ),
    expire: vi.fn(async () => 1),
  },
}));

import { POST as unsubscribePost } from "@/app/api/unsubscribe/route";
import { POST as preferencesPost } from "@/app/api/preferences/route";
import { buildEmailLinkToken } from "@/lib/onboarding/email-link-token";

type RouteHandler = (request: NextRequest) => Promise<Response>;

const cases: Array<{
  name: string;
  handler: RouteHandler;
  pathname: string;
  body: (token: string) => unknown;
}> = [
  {
    name: "unsubscribe",
    handler: unsubscribePost,
    pathname: "/api/unsubscribe",
    body: (token) => ({ token }),
  },
  {
    name: "preferences",
    handler: preferencesPost,
    pathname: "/api/preferences",
    body: (token) => ({
      token,
      prefs: { transactional: true, marketing: false },
    }),
  },
];

function makeRequest(
  pathname: string,
  token: string,
  body: unknown,
  ip: string
): NextRequest {
  return new NextRequest(`https://zaltyko.test${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function runRequests(
  handler: RouteHandler,
  pathname: string,
  tokens: string[],
  ips: string[],
  body: (token: string) => unknown
): Promise<Response[]> {
  const responses: Response[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    responses.push(
      await handler(
        makeRequest(pathname, tokens[index], body(tokens[index]), ips[index])
      )
    );
  }
  return responses;
}

describe.each(cases)(
  "$name address-hash rate limit",
  ({ handler, pathname, body }) => {
    beforeEach(() => {
      state.buckets.clear();
      state.insert.mockClear();
      process.env.KV_REST_API_URL = "https://kv.test";
      process.env.KV_REST_API_TOKEN = "test-token";
      process.env.UNSUBSCRIBE_HMAC_SECRET = "test-unsubscribe-secret";
    });

    it("mantiene el límite por IP: sexta request desde la misma IP devuelve 429", async () => {
      const token = buildEmailLinkToken({
        email: "owner@example.com",
        purpose: pathname.endsWith("unsubscribe")
          ? "unsubscribe"
          : "preferences",
      }).token;

      const responses = await runRequests(
        handler,
        pathname,
        Array(6).fill(token),
        Array(6).fill("203.0.113.10"),
        body
      );

      expect(responses.map(({ status }) => status)).toEqual([
        200, 200, 200, 200, 200, 429,
      ]);
    });

    it("limita la misma dirección aunque cada request rote de IP", async () => {
      const token = buildEmailLinkToken({
        email: "owner@example.com",
        purpose: pathname.endsWith("unsubscribe")
          ? "unsubscribe"
          : "preferences",
      }).token;

      const responses = await runRequests(
        handler,
        pathname,
        Array(6).fill(token),
        [
          "203.0.113.11",
          "203.0.113.12",
          "203.0.113.13",
          "203.0.113.14",
          "203.0.113.15",
          "203.0.113.16",
        ],
        body
      );

      expect(responses.map(({ status }) => status)).toEqual([
        200, 200, 200, 200, 200, 429,
      ]);
      expect(responses[5].headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("permite seis direcciones distintas desde seis IPs distintas", async () => {
      const tokens = Array.from(
        { length: 6 },
        (_, index) =>
          buildEmailLinkToken({
            email: `owner-${index}@example.com`,
            purpose: pathname.endsWith("unsubscribe")
              ? "unsubscribe"
              : "preferences",
          }).token
      );

      const responses = await runRequests(
        handler,
        pathname,
        tokens,
        [
          "198.51.100.11",
          "198.51.100.12",
          "198.51.100.13",
          "198.51.100.14",
          "198.51.100.15",
          "198.51.100.16",
        ],
        body
      );

      expect(responses.map(({ status }) => status)).toEqual([
        200, 200, 200, 200, 200, 200,
      ]);
    });
  }
);
