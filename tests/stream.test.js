import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable, pipeline } from "node:stream";
import { promisify } from "node:util";
import { parseCSV, createParseStream, CsvParseError } from "../src/index.js";

const pipelineAsync = promisify(pipeline);
const plain = (rows) => rows.map((r) => ({ ...r }));

function collect(stream) {
  return new Promise((resolve, reject) => {
    const rows = [];
    stream.on("data", (r) => rows.push(r));
    stream.on("end", () => resolve(rows));
    stream.on("error", reject);
  });
}

function feedString(csv, options) {
  const s = createParseStream(options);
  s.end(csv);
  return collect(s);
}

function feedCharByChar(csv, options) {
  const s = createParseStream(options);
  for (const ch of csv) s.write(ch);
  s.end();
  return collect(s);
}

function feedChunks(chunks, options) {
  const s = createParseStream(options);
  for (const c of chunks) s.write(c);
  s.end();
  return collect(s);
}

describe("stream: basic", () => {
  it("same result as parseCSV", async () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    const expected = plain(parseCSV(csv));
    const result = plain(await feedString(csv));
    assert.deepStrictEqual(result, expected);
  });

  it("empty stream gives no rows", async () => {
    const rows = await feedString("");
    assert.deepStrictEqual(rows, []);
  });

  it("headers:false works", async () => {
    const csv = "a,b\n1,2\n3,4";
    const expected = parseCSV(csv, { headers: false });
    const result = await feedString(csv, { headers: false });
    assert.deepStrictEqual(result, expected);
  });

  it("custom headers array works", async () => {
    const csv = "Aditya,18\nRahul,20";
    const opts = { headers: ["name", "age"] };
    const expected = plain(parseCSV(csv, opts));
    const result = plain(await feedString(csv, opts));
    assert.deepStrictEqual(result, expected);
  });
});

describe("stream: chunking", () => {
  it("one character at a time gives the same result", async () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    const expected = plain(parseCSV(csv));
    const result = plain(await feedCharByChar(csv));
    assert.deepStrictEqual(result, expected);
  });

  it("\\r\\n split across two chunks", async () => {
    const rows = plain(await feedChunks(["name,age\r", "\nAditya,18"]));
    assert.deepStrictEqual(rows, [{ name: "Aditya", age: "18" }]);
  });

  it("quoted field with escaped quote split across chunks", async () => {
    const rows = plain(await feedChunks(['greeting\n"He said, ""', 'Hello"""']));
    assert.deepStrictEqual(rows, [{ greeting: 'He said, "Hello"' }]);
  });

  it("header row split across chunks", async () => {
    const rows = plain(await feedChunks(["na", "me,ag", "e\nAditya,18"]));
    assert.deepStrictEqual(rows, [{ name: "Aditya", age: "18" }]);
  });
});

describe("stream: multibyte / BOM", () => {
  it("multi-byte character split across Buffer chunks", async () => {
    const full = Buffer.from("name\nAditya é\n", "utf8");
    const idx = full.indexOf(0xc3);
    const rows = plain(await feedChunks([full.slice(0, idx + 1), full.slice(idx + 1)]));
    assert.strictEqual(rows[0].name, "Aditya é");
  });

  it("emoji split across Buffer chunks", async () => {
    const full = Buffer.from("v\nhello 🎉\n", "utf8");
    const idx = full.indexOf(0xf0);
    const rows = plain(await feedChunks([full.slice(0, idx + 2), full.slice(idx + 2)]));
    assert.strictEqual(rows[0].v, "hello 🎉");
  });

  it("BOM at the start is stripped", async () => {
    const csv = "\uFEFFname,age\nAditya,18";
    const rows = plain(await feedString(csv));
    assert.deepStrictEqual(rows, [{ name: "Aditya", age: "18" }]);
  });

  it("BOM only stripped on first chunk, not mid-stream", async () => {
    const csv = "name\n\uFEFFAditya";
    const rows = plain(await feedString(csv));
    assert.deepStrictEqual(rows, [{ name: "\uFEFFAditya" }]);
  });
});

describe("stream: errors", () => {
  it("unterminated quote emits error at end", async () => {
    await assert.rejects(feedString('name\n"abc'), CsvParseError);
  });

  it("column mismatch emits CsvParseError with correct row number", async () => {
    await assert.rejects(
      feedString("a,b\n1,2,3"),
      (err) => err instanceof CsvParseError && err.row === 2
    );
  });

  it("duplicate headers emits CsvParseError", async () => {
    await assert.rejects(feedString("a,a\n1,2"), CsvParseError);
  });

  it("invalid options throw TypeError synchronously", () => {
    assert.throws(() => createParseStream({ delimiter: "xx" }), TypeError);
  });
});

describe("stream: maxRows", () => {
  it("maxRows stops early", async () => {
    await assert.rejects(
      feedString("a\n1\n2\n3\n4\n5", { maxRows: 2 }),
      CsvParseError
    );
  });

  it("maxRows stops without reading everything", async () => {
    let chunksProvided = 0;
    let completed = false;

    async function* generator() {
      yield "a\n";
      for (let i = 0; i < 1000; i++) {
        chunksProvided++;
        yield `${i}\n`;
      }
      completed = true;
    }

    const stream = createParseStream({ maxRows: 2 });
    await assert.rejects(
      pipelineAsync(Readable.from(generator()), stream, new Writable({
        objectMode: true,
        write(_chunk, _enc, cb) { cb(); }
      })),
      CsvParseError
    );

    assert.strictEqual(completed, false);
    assert.ok(chunksProvided < 20);
  });
});

describe("stream: cast", () => {
  it("cast:true works in streaming", async () => {
    const csv = "name,age,active\nAditya,18,true\nRahul,,false";
    const rows = plain(await feedString(csv, { cast: true }));
    assert.deepStrictEqual(rows, [
      { name: "Aditya", age: 18, active: true },
      { name: "Rahul", age: null, active: false },
    ]);
  });

  it("cast:true one char at a time matches parseCSV", async () => {
    const csv = "a,b\n42,true";
    const expected = plain(parseCSV(csv, { cast: true }));
    const result = plain(await feedCharByChar(csv, { cast: true }));
    assert.deepStrictEqual(result, expected);
  });
});

describe("stream: pipeline / for-await", () => {
  it("works with stream.pipeline", async () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    const rows = [];
    const src = Readable.from([csv]);
    const parse = createParseStream();
    const dst = new Writable({
      objectMode: true,
      write(chunk, _encoding, callback) {
        rows.push(chunk);
        callback();
      },
    });
    await pipelineAsync(src, parse, dst);
    assert.deepStrictEqual(plain(rows), [
      { name: "Aditya", age: "18" },
      { name: "Rahul", age: "20" },
    ]);
  });

  it("works with for-await", async () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    const s = createParseStream();
    s.end(csv);
    const rows = [];
    for await (const row of s) {
      rows.push({ ...row });
    }
    assert.deepStrictEqual(rows, [
      { name: "Aditya", age: "18" },
      { name: "Rahul", age: "20" },
    ]);
  });
});
