import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Vitest projects may keep the repository root as the parent process cwd.
const mobileRoot = fileURLToPath(new URL("../", import.meta.url));

it("handles an indexed source map far beyond the generated code without blocking", () => {
  const result = execFileSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require('node:module');
       const fromExpo = createRequire(require.resolve('expo/package.json'));
       const fromConfig = createRequire(fromExpo.resolve('@expo/metro-config/package.json'));
       const fromPostcss = createRequire(fromConfig.resolve('postcss/package.json'));
       const { SourceMapConsumer, SourceNode } = fromPostcss('source-map-js');
       const assert = require("node:assert/strict");
       assert.throws(() => new SourceMapConsumer({version:3, sections:[{
         offset:{line:1000000000,column:0},
         map:{version:3,sources:['input.js'],names:[],mappings:'AAAA'}
       }]}), /Section offset line/);
       const consumer = new SourceMapConsumer({version:3,sources:['input.js'],names:[],mappings:'AAAA'});
       assert.equal(SourceNode.fromStringWithSourceMap('x', consumer).toString(), 'x');
       process.stdout.write('completed');`,
    ],
    { cwd: mobileRoot, timeout: 3000, encoding: "utf8" }
  );
  expect(result).toBe("completed");
});

it("destroys the gzip stream when a compressed response closes early", () => {
  const result = execFileSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require('node:module');
       const fromExpo = createRequire(require.resolve('expo/package.json'));
       const fromCli = createRequire(fromExpo.resolve('@expo/cli/package.json'));
       const zlib = require('node:zlib');
       const http = require('node:http');
       let stream;
       const original = zlib.createGzip;
       Object.defineProperty(zlib, 'createGzip', {value: (...args) => {
         stream = original(...args); return stream;
       }});
       const compression = fromCli('compression')({threshold:0});
       const server = http.createServer((req,res) => compression(req,res,() => {
         res.setHeader('Content-Type','text/plain');
         res.write('payload');
         res.flush();
         res.on('close', () => setImmediate(() => {
           const ok = stream && stream.destroyed;
           server.close(() => {process.stdout.write(String(ok));});
         }));
       }));
       server.listen(0,'127.0.0.1',() => {
         http.get({host:'127.0.0.1',port:server.address().port,
           headers:{'Accept-Encoding':'gzip'}},res => {
           res.once('data',() => res.destroy());
         }).on('error', () => {});
       });`,
    ],
    { cwd: mobileRoot, timeout: 3000, encoding: "utf8" }
  );
  expect(result).toBe("true");
});
