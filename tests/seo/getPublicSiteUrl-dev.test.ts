import { describe, expect, it } from "vitest";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

describe("getPublicSiteUrl dev fallback", () => {
  it("devuelve localhost cuando NODE_ENV=development, incluso con NEXT_PUBLIC_APP_URL de zaltyko.com", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko.com";
    const url = getPublicSiteUrl();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
    expect(url).toBe("http://localhost:3000");
  });

  it("devuelve localhost cuando NODE_ENV=development y NEXT_PUBLIC_APP_URL apunta a preview", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko-foo.vercel.app";
    const url = getPublicSiteUrl();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
    expect(url).toBe("http://localhost:3000");
  });

  it("devuelve localhost cuando NODE_ENV=development y no hay NEXT_PUBLIC_APP_URL", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = getPublicSiteUrl();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
    expect(url).toBe("http://localhost:3000");
  });

  it("en producción (NODE_ENV=test), sigue respetando zaltyko.com", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko.com";
    const url = getPublicSiteUrl();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
    expect(url).toBe("https://zaltyko.com");
  });

  it("en producción, filtra previews aunque NODE_ENV no sea 'development'", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://zaltyko-preview.vercel.app";
    const url = getPublicSiteUrl();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
    expect(url).toBe("https://zaltyko.com");
  });
});
