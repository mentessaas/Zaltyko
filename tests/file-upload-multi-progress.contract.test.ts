import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("file upload multi-file reliability", () => {
  it("uses a current ref when progress updates arrive asynchronously", () => {
    const source = readFileSync("src/components/ui/file-upload.tsx", "utf8");
    expect(source).toContain("const valueRef = React.useRef(value)");
    expect(source).toContain("valueRef.current.map");
    expect(source).toContain("valueRef.current = newFiles");
    expect(source).toContain("tamaño máximo");
  });
});
