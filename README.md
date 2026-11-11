# csv-easy

A lightweight, zero-dependency CSV parser for Node.js (ES modules, Node 18+).

## Install

```bash
npm install csv-easy
```

## Usage

```js
import { parseCSV } from "csv-easy";

const csv = `name,age
Aditya,18
Rahul,20`;

const data = parseCSV(csv);

console.log(data);
// [
//   { name: 'Aditya', age: '18' },
//   { name: 'Rahul', age: '20' }
// ]
```

### Streaming

For large files or streaming data, use `createParseStream(options)`. It returns a Node `Transform` stream in object mode:

```js
import fs from "node:fs";
import { createParseStream } from "csv-easy";

fs.createReadStream("data.csv")
  .pipe(createParseStream({ cast: true }))
  .on("data", (row) => console.log(row));
```

By default all values are returned as **strings**. Enable type casting with the `cast` option to convert numbers, booleans, nulls, and dates automatically.

## Options

`parseCSV(input, options)` accepts an optional `options` object:

| Option | Type | Default | Description |
|---|---|---|---|
| `delimiter` | `string` | `","` | Single-character field delimiter (e.g. `";"`, `"\t"`, `"\|"`). Must not be `"`, `\r`, or `\n`. |
| `quote` | `string` | `'"'` | Single-character quote delimiter. Must differ from `delimiter`. |
| `trim` | `boolean` | `false` | When `true`, trims whitespace on unquoted fields and header names. Quoted fields remain intact. |
| `headers` | `boolean \| string[]` | `true` | `true`: first row is header (returns objects).<br>`false`: no headers (returns array of string arrays).<br>`string[]`: custom header names (first row treated as data). |
| `skipEmptyLines` | `boolean` | `true` | When `true`, empty and blank lines are ignored. |
| `maxRows` | `number` | `Infinity` | Maximum number of data rows to parse. Throws `CsvParseError` if exceeded. |
| `cast` | `boolean \| function \| object` | `false` | Type casting. `true`: apply default rules. Function: custom per-field caster. Object: enable/disable individual rules. |

### Options examples

#### Custom delimiter and quotes
```js
const tsv = "name\tage\nAditya\t18";
parseCSV(tsv, { delimiter: "\t" });

const scsv = 'name;bio\nAditya;"Engineer; Loves JS"';
parseCSV(scsv, { delimiter: ";" });
```

#### No headers (`headers: false`)
```js
const csv = "a,b\n1,2\n3,4";
const rows = parseCSV(csv, { headers: false });
// [
//   ['a', 'b'],
//   ['1', '2'],
//   ['3', '4']
// ]
```

#### Custom headers (`headers: string[]`)
```js
const csv = "Aditya,18\nRahul,20";
const records = parseCSV(csv, { headers: ["name", "age"] });
// [
//   { name: 'Aditya', age: '18' },
//   { name: 'Rahul', age: '20' }
// ]
```

#### Trim unquoted whitespace
```js
const csv = '  name  ,  age  \n  Aditya  ,"  18  "';
const records = parseCSV(csv, { trim: true });
// [
//   { name: 'Aditya', age: '  18  ' }
// ]
```

When `trim: true`:
- Unquoted values and header names are trimmed.
- Quoted values preserve exact content and inner whitespace.
- Whitespace between a closing quote and a delimiter/line ending (e.g. `"val" ,`) is allowed.
- Whitespace-only lines (e.g. `"   "`) trim to `""` and are skipped as blank rows when `skipEmptyLines: true`.
- With `trim: false`, a line with spaces (e.g. `"   "`) is treated as a 1-field row `["   "]`, which throws a column count mismatch in a multi-column CSV.

#### Row limits (`maxRows`)
```js
parseCSV("a\n1\n2\n3", { maxRows: 2 }); // throws CsvParseError: Row limit of 2 exceeded.
```

#### Type casting (`cast`)

By default (`cast: false`), all values are strings. Set `cast: true` to enable the built-in casting rules:

```js
const csv = "name,age,active\nAditya,18,true\nRahul,,false";
parseCSV(csv, { cast: true });
// [
//   { name: 'Aditya', age: 18, active: true },
//   { name: 'Rahul',  age: null, active: false }
// ]
```

**Built-in rules** (all enabled by default except `date`):

| Rule | Match | Example |
|---|---|---|
| `number` | Strict decimal: `^-?(0\|[1-9]\d*)(\.\d+)?$`. Must be a safe integer or lossless float. | `"18"` → `18`, `"3.14"` → `3.14`. `"007"`, `"1e5"`, `"+5"` stay strings. |
| `boolean` | Exactly `"true"` or `"false"` (lowercase). | `"true"` → `true`. `"True"` stays string. |
| `null` | Empty unquoted field. | ` ` → `null`. Quoted `""` stays `""`. |
| `date` | Strict ISO 8601: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss(.sss)?(Z\|±HH:mm)`. Invalid dates stay strings. | **Opt-in only.** |

**Quoted fields are never auto-cast.** A quoted `"18"` stays the string `"18"`.

**Per-rule object:** enable or disable individual rules. Unspecified keys default to `true` (except `date` which defaults to `false`):

```js
parseCSV(csv, { cast: { number: true, boolean: false, null: true, date: true } });
// Only cast numbers, nulls, and dates – booleans stay strings.
```

**Custom function:** receives `(value, context)` where `context` is `{ column, index, row, quoted }`. Called for data rows only. Return value replaces the field. If the function throws, the error is wrapped in `CsvParseError`.

```js
parseCSV(csv, {
  cast: (value, { column, quoted }) => {
    if (column === "age") return Number(value);
    return value;
  },
});
```

With `headers: false`, `context.column` is the zero-based field index instead of the header name.

## Error handling

- Invalid option keys or values throw standard `TypeError`.
- Malformed CSV, unterminated quotes, duplicate headers, column count mismatches, or `maxRows` violations throw `CsvParseError`.

```js
import { parseCSV, CsvParseError } from "csv-easy";

try {
  parseCSV(badInput, { delimiter: ";" });
} catch (err) {
  if (err instanceof CsvParseError) {
    console.error(err.message); // human-readable description
    console.error(err.row);     // 1-based row number
    console.error(err.status);  // 400
  } else if (err instanceof TypeError) {
    console.error(err.message); // invalid input or option error
  }
}
```

## Running tests

```bash
node --test
```
