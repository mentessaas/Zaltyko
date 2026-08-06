import { afterEach, describe, expect, it } from "vitest";

import { getPublicSiteUrl } from "@/lib/seo/site-url";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("getPublicSiteUrl", () => {
  it("consolidates Vercel project URLs on the custom domain", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko.vercel.app";
    expect(getPublicSiteUrl()).toBe("https://zaltyko.com");
  });

  it("consolidates temporary Cloudflare tunnel URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL =
      "https://hypothetical-leather-algorithms-roland.trycloudflare.com/";
    expect(getPublicSiteUrl()).toBe("https://zaltyko.com");
  });

  it("keeps a valid non-deployment URL for local or explicitly configured environments", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000/";
    expect(getPublicSiteUrl()).toBe("http://localhost:3000");
  });
});
