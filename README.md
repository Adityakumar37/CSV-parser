# csv-easy

A zero-dependency CSV parser for Node.js 18 and newer. It supports strings, streams, and Express middleware.

## Install

```sh
npm install csv-easy
```

## Quick start

```js
import { parseCSV } from "csv-easy";

const rows = parseCSV("name,age\nAda,18");
console.log(rows);
// [{ name: "Ada", age: "18" }]
```

By default, the first row is used for headers and values are strings.

## Options

| Option | Default | Description |
|---|---|---|
| `delimiter` | `","` | Single character between fields. |
| `quote` | `"\""` | Single character for quoted fields. Must differ from delimiter. |
| `trim` | `false` | Trims unquoted fields and header names. |
| `headers` | `true` | `true` uses the first row, `false` returns arrays, or pass custom header names. |
| `skipEmptyLines` | `true` | Skips blank rows. |
| `maxRows` | `Infinity` | Maximum number of data rows. Exceeding it throws `CsvParseError`. |
| `cast` | `false` | Enables built-in value casting, per-rule flags, or a custom function. |
| `maxBytes` | `1_000_000` | Middleware only: maximum raw request body size in bytes. |
| `property` | `"csv"` | Middleware only: request property to receive parsed rows. |
| `timeout` | `30_000` | Middleware only: request read timeout in milliseconds. |

`delimiter` and `quote` must each be one character. Delimiter cannot be a quote or newline; quote cannot be a newline.

## Casting

`cast: true` converts strict decimal numbers, lowercase `true` and `false`, and empty unquoted values to `null`. Dates are not cast unless `date: true` is set. Quoted fields are not auto-cast. You can enable or disable individual rules with an object:

```js
parseCSV("name,age\nAda,18", { cast: { number: true } });
```

A custom cast function receives `(value, context)`. The context has `column`, `index`, `row`, and `quoted` properties.

## Streaming

`createParseStream` returns a Node.js transform stream that emits one parsed row at a time:

```js
import fs from "node:fs";
import { createParseStream } from "csv-easy";

fs.createReadStream("data.csv")
  .pipe(createParseStream({ cast: true }))
  .on("data", (row) => console.log(row));
```

## Middleware

Use `csvMiddleware` after any middleware that should run first. It reads raw requests with `Content-Type: text/csv` (including a charset parameter) and sets `req.csv` by default. Parsing failures are passed to `next(err)`; the middleware does not send a response.

```js
import express from "express";
import { csvMiddleware } from "csv-easy";

const app = express();
app.post("/upload", csvMiddleware({ cast: true }), (req, res) => {
  res.json(req.csv);
});
```

Express and multer are optional peer usage examples; neither is installed by this package. With multer already configured, the middleware parses its in-memory buffer or disk path:

```js
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });
app.post("/upload", upload.single("file"), csvMiddleware(), (req, res) => {
  res.json(req.csv);
});
```

For multiple files, use multer's `upload.array(...)` or `upload.fields(...)`. One file produces an array of rows. Multiple files produce an object keyed by field name, with each value an array of results.

## Errors

`CsvParseError` has `message`, `row` (1-based), and `status` (400). Middleware size errors have status 413 and timeouts have status 408. Option and input type errors are `TypeError` instances.

```js
import { CsvParseError, parseCSV } from "csv-easy";

try {
  parseCSV('name\n"unfinished');
} catch (err) {
  if (err instanceof CsvParseError) {
    console.log(err.message, err.row, err.status);
  }
}
```

## Limitations

The package does not parse multipart requests itself; use multer or another upload middleware first. It parses CSV but does not write CSV files.
