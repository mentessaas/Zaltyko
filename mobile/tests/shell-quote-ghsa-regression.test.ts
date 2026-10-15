import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { quote } = require("shell-quote") as {
  quote: (tokens: (string | { comment: string })[]) => string;
};

it("rejects a line terminator after a shell comment token", () => {
  // GHSA-pqg4-j6r4-53mv: keep this as data; never pass it to a real shell.
  expect(() => quote(["echo", "ok", { comment: "x" }, "a\nid;#"])).toThrow(
    TypeError
  );
});
