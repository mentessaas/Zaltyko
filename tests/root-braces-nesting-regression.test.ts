import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const fromRoot = createRequire(import.meta.url);
const fromTailwind = createRequire(
  fromRoot.resolve("tailwindcss/package.json")
);
const fromMicromatch = createRequire(
  fromTailwind.resolve("micromatch/package.json")
);
const require = createRequire(fromMicromatch.resolve("braces/package.json"));
type AstNode = {
  type: string;
  value?: string;
  nodes?: AstNode[];
  parent?: AstNode;
};
type ParseOptions = { maxDepth?: number };
type StringifyOptions = ParseOptions & { escapeInvalid?: boolean };

const parse = require("braces/lib/parse") as (
  input: string,
  options?: ParseOptions
) => AstNode;
const compile = require("braces/lib/compile") as (ast: AstNode) => string;
const expand = require("braces/lib/expand") as (ast: AstNode) => string[];
const stringify = require("braces/lib/stringify") as (
  ast: AstNode,
  options?: StringifyOptions
) => string;

function makeDeepAst(depth = 101): AstNode {
  let ast: AstNode = { type: "text", value: "a" };
  for (let level = 0; level < depth; level += 1) {
    ast = { type: "brace", nodes: [ast] };
  }
  return { type: "root", nodes: [ast] };
}

function nestedPattern(depth: number, delimiter: "brace" | "paren"): string {
  const [open, close, body] =
    delimiter === "brace" ? ["{", "}", "a,b"] : ["(", ")", "a"];
  return open.repeat(depth) + body + close.repeat(depth);
}

it("rejects brace and parenthesis nesting beyond the default depth", () => {
  for (const delimiter of ["brace", "paren"] as const) {
    expect(parse(nestedPattern(100, delimiter))).toBeDefined();
    expect(() => parse(nestedPattern(101, delimiter))).toThrow(
      /exceeds max depth/
    );
  }
});

it("honors a caller's stricter maxDepth", () => {
  expect(() => parse("{{a,b},c}", { maxDepth: 1 })).toThrow(
    /exceeds max depth/
  );
  expect(() => parse("{{a,b},c}", { maxDepth: 2 })).not.toThrow();
});

it("guards compile, expand, and stringify when handed a deep AST", () => {
  expect(() => compile(makeDeepAst(100))).not.toThrow();
  expect(() => expand(makeDeepAst(100))).not.toThrow();
  expect(() => stringify(makeDeepAst(100))).not.toThrow();
  expect(() => compile(makeDeepAst())).toThrow(/exceeds max depth/);
  expect(() => expand(makeDeepAst())).toThrow(/exceeds max depth/);
  expect(() => stringify(makeDeepAst())).toThrow(/exceeds max depth/);
});

it("rejects cyclic AST parent references instead of looping", () => {
  const ast: AstNode = { type: "paren", nodes: [{ type: "text", value: "a" }] };
  ast.parent = ast;

  expect(() =>
    runInNewContext("expand(ast)", { expand, ast }, { timeout: 250 })
  ).toThrow(/parent chain contains a cycle/);
});

it("preserves valid nested braces with escapeInvalid enabled", () => {
  for (const pattern of ["{{a}}", "{a,{b}}", "{{x}y}", "{a,{b,{c}}", "{}{a}"]) {
    expect(stringify(parse(pattern), { escapeInvalid: true })).toBe(pattern);
  }
});

it("preserves ordinary brace glob matching through Tailwind's micromatch", () => {
  const match = fromTailwind("micromatch") as (
    files: string[],
    patterns: string[]
  ) => string[];
  expect(
    match(
      ["src/app/page.tsx", "src/app/page.md", "src/components/card.jsx"],
      ["src/**/*.{js,ts,jsx,tsx,mdx}"]
    )
  ).toEqual(["src/app/page.tsx", "src/components/card.jsx"]);
});

it("preserves the configured Tailwind content globs over fixture files", async () => {
  const root = mkdtempSync(join(tmpdir(), "root-braces-glob-"));
  try {
    for (const file of [
      "src/pages/home.tsx",
      "src/components/card.jsx",
      "src/app/page.mdx",
      "src/app/ignore.txt",
      "other/hidden.tsx",
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "fixture");
    }
    const config = readFileSync(
      new URL("../tailwind.config.mjs", import.meta.url),
      "utf8"
    );
    const content = config.match(/content:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const patterns = [...content.matchAll(/"([^"\n]+)"/g)].map(
      (match) => match[1]
    );
    expect(patterns).toHaveLength(3);
    const glob = fromTailwind("fast-glob") as (
      patterns: string[],
      options: { cwd: string }
    ) => Promise<string[]>;
    expect((await glob(patterns, { cwd: root })).sort()).toEqual([
      "./src/app/page.mdx",
      "./src/components/card.jsx",
      "./src/pages/home.tsx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("preserves HTML discovery through next-sitemap's fast-glob", async () => {
  const root = mkdtempSync(join(tmpdir(), "root-braces-sitemap-"));
  try {
    mkdirSync(join(root, "about"));
    writeFileSync(join(root, "index.html"), "fixture");
    writeFileSync(join(root, "about", "index.html"), "fixture");
    writeFileSync(join(root, "ignore.txt"), "fixture");
    const fromSitemap = createRequire(fromRoot.resolve("next-sitemap"));
    const glob = fromSitemap("fast-glob") as (
      pattern: string
    ) => Promise<string[]>;
    expect((await glob(`${root}/**/*.html`)).sort()).toEqual([
      join(root, "about", "index.html"),
      join(root, "index.html"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("registers the root patch on both braces dependency edges in the lock", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  );
  expect(manifest.pnpm.patchedDependencies["braces@3.0.3"]).toBe(
    "patches/braces@3.0.3.patch"
  );
  const lock = readFileSync(
    new URL("../pnpm-lock.yaml", import.meta.url),
    "utf8"
  );
  const hash = lock.match(
    /patchedDependencies:\s+braces@3\.0\.3:\s+hash: ([a-z0-9]+)/
  )?.[1];
  expect(hash).toBeDefined();
  expect(lock.match(/braces: 3\.0\.3\(patch_hash=/g)).toHaveLength(2);
  expect(lock).toContain(`braces@3.0.3(patch_hash=${hash}):`);
  expect(lock.split("snapshots:")[1]).not.toMatch(/^  braces@3\.0\.3:$/m);
});

it("preserves the pristine 3.0.3 behavior for quoted and escaped patterns", () => {
  const braces = fromMicromatch("braces") as (
    pattern: string,
    options: { expand: boolean; keepQuotes?: boolean }
  ) => string[];
  expect(braces('{"a,b",c}', { expand: true })).toEqual(["a,b", "c"]);
  expect(braces("{'a,b',c}", { expand: true })).toEqual(["a,b", "c"]);
  expect(braces("foo\\{bar,baz\\}", { expand: true })).toEqual([
    "foo{bar,baz}",
  ]);
  expect(braces('{"a\\"b",c}', { expand: true })).toEqual(['a\\"b', "c"]);
  expect(braces('{"a,b",c}', { expand: true, keepQuotes: true })).toEqual([
    '"a,b"',
    "c",
  ]);
});
