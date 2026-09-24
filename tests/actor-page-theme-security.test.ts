import { describe, expect, it } from "vitest";
import { themeToCssVars } from "@/lib/actor-pages/theme";

describe("untrusted actor page theme", () => {
  it("preserves supported custom colors", () => {
    expect(themeToCssVars({ primary_color: "#abc", secondary_color: "#123ABC" })).toContain("--z-primary:#abc;--z-secondary:#123ABC");
  });
  it.each(["</style><script>alert(1)</script>", "red;background:url(https://invalid.test/track)", {}, null])("rejects active CSS and HTML values %j", (primary_color) => {
    const css = themeToCssVars({ primary_color } as never);
    expect(css).toContain("--z-primary:#3b82f6");
    expect(css).not.toMatch(/[<>]|url\(/);
  });
});
