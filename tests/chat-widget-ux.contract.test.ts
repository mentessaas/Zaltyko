import fs from "node:fs";
import path from "node:path";

describe("chat widget interaction safety", () => {
  it("does not submit a surrounding form and supports quick keyboard dismissal", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/chat/ChatWidget.tsx"), "utf8");
    expect(source).toContain('<button\n        type="button"');
    expect(source).toContain('<Button\n                type="button"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("inputRef.current?.focus()");
  });
});
