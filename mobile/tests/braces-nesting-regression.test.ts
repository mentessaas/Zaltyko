import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
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
