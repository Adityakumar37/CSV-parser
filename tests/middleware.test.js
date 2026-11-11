import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { csvMiddleware, CsvParseError } from "../src/index.js";

function request(type = "text/csv") {
  const req = new PassThrough({ autoDestroy: false });
  req.headers = { "content-type": type };
  req.complete = false;
  req.on("end", () => { req.complete = true; });
  return req;
}

function call(req, options) {
  return new Promise((resolve) => {
    let calls = 0;
    csvMiddleware(options)(req, {}, (err) => {
      calls++;
      resolve({ err, calls });
    });
  });
}

function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value)) result[key] = plain(value[key]);
    return result;
  }
  return value;
}

describe("csv middleware", () => {
  it("parses raw CSV", async () => {
    const req = request();
    const result = call(req);
    req.end("name\nAda");
    assert.deepStrictEqual(await result, { err: undefined, calls: 1 });
    assert.deepStrictEqual(plain(req.csv), [{ name: "Ada" }]);
  });

  it("accepts a CSV content type with parameters", async () => {
    const req = request("text/csv; charset=utf-8");
    const result = call(req);
    req.end("a\n1");
    await result;
    assert.deepStrictEqual(plain(req.csv), [{ a: "1" }]);
  });

  it("passes other content types through", async () => {
    const req = request("application/json");
    const result = await call(req);
    assert.deepStrictEqual(result, { err: undefined, calls: 1 });
    assert.equal(req.csv, undefined);
  });

  it("parses a multer buffer", async () => {
    const req = new PassThrough();
    req.file = { buffer: Buffer.from("a\n1"), fieldname: "file" };
    await call(req);
    assert.deepStrictEqual(plain(req.csv), [{ a: "1" }]);
  });

  it("parses a multer path", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-easy-"));
    const file = path.join(dir, "data.csv");
    fs.writeFileSync(file, "a\n1");
    const req = new PassThrough();
    req.file = { path: file, fieldname: "file" };
    try {
      await call(req);
      assert.deepStrictEqual(plain(req.csv), [{ a: "1" }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses multiple files", async () => {
    const req = new PassThrough();
    req.files = [
      { fieldname: "first", buffer: Buffer.from("a\n1") },
      { fieldname: "second", buffer: Buffer.from("b\n2") },
    ];
    await call(req);
    assert.deepStrictEqual(plain(req.csv), {
      first: [[{ a: "1" }]],
      second: [[{ b: "2" }]],
    });
  });

  it("rejects a body over maxBytes and stops reading", async () => {
    const req = request();
    let unpiped = false;
    const unpipe = req.unpipe.bind(req);
    req.unpipe = (stream) => { unpiped = true; return unpipe(stream); };
    const result = call(req, { maxBytes: 3 });
    req.write("a\n1\n");
    req.write("2\n");
    const { err } = await result;
    assert.equal(err.status, 413);
    assert.equal(unpiped, true);
  });

  it("returns a row error for bad CSV", async () => {
    const req = request();
    const result = call(req);
    req.end('a\n"bad"x');
    const { err } = await result;
    assert.ok(err instanceof CsvParseError);
    assert.equal(err.status, 400);
    assert.equal(err.row, 2);
  });

  it("stops when maxRows is exceeded", async () => {
    const req = request();
    let unpiped = false;
    const unpipe = req.unpipe.bind(req);
    req.unpipe = (stream) => { unpiped = true; return unpipe(stream); };
    const result = call(req, { maxRows: 1 });
    req.write("a\n1\n");
    req.write("2\n3\n");
    const { err } = await result;
    assert.ok(err instanceof CsvParseError);
    assert.equal(err.status, 400);
    assert.equal(unpiped, true);
  });

  it("times out", async () => {
    const req = request();
    const { err } = await call(req, { timeout: 10 });
    assert.equal(err.status, 408);
  });

  it("handles a client abort once", async () => {
    const req = request();
    let calls = 0;
    csvMiddleware()(req, {}, () => { calls++; });
    req.emit("aborted");
    req.emit("close");
    assert.ok(calls <= 1);
  });

  it("uses a custom property", async () => {
    const req = request();
    const result = call(req, { property: "records" });
    req.end("a\n1");
    await result;
    assert.deepStrictEqual(plain(req.records), [{ a: "1" }]);
  });

  it("passes cast and delimiter options through", async () => {
    const req = request();
    const result = call(req, { delimiter: ";", cast: true });
    req.end("name;age\nAda;18");
    await result;
    assert.deepStrictEqual(plain(req.csv), [{ name: "Ada", age: 18 }]);
  });

  it("works with a real HTTP request", async () => {
    const server = http.createServer((req, res) => {
      csvMiddleware()(req, res, (err) => {
        if (err) {
          res.statusCode = err.status || 500;
          res.end(err.message);
        } else {
          res.end(JSON.stringify(req.csv));
        }
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: "127.0.0.1",
          port: server.address().port,
          method: "POST",
          headers: { "content-type": "text/csv" },
        }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end("a\n1");
      });
      assert.equal(result.status, 200);
      assert.deepStrictEqual(JSON.parse(result.body), [{ a: "1" }]);
    } finally {
      server.close();
    }
  });
});
