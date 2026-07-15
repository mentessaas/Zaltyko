import { describe, expect, it } from "vitest";

import { escapeHtml } from "@/lib/email/escape-html";

describe("escapeHtml", () => {
  it("escapes HTML control characters", () => {
    expect(escapeHtml(`<script>alert('x')</script> & \"quoted\"`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;"
    );
  });

  it("preserves plain text and line breaks for the caller to format", () => {
    expect(escapeHtml("Nombre\nMensaje")).toBe("Nombre\nMensaje");
  });
});
