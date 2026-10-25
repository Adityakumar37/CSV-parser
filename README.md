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

All values are returned as **strings** — no automatic type casting.

## Error handling

```js
import { parseCSV, CsvParseError } from "csv-easy";

try {
  parseCSV(badInput);
} catch (err) {
  if (err instanceof CsvParseError) {
    console.error(err.message); // human-readable description
    console.error(err.row);     // 1-based row number
    console.error(err.status);  // 400
  }
}
```

## Running tests

```bash
node --test
```
