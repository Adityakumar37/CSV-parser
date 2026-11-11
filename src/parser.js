import { CsvParseError } from "./tokenizer.js";
import { buildCaster } from "./caster.js";

// createRowBuilder returns a function that takes one tokenizer row and returns
// the finished record (object or array), or null if the row was the header row.
// Throws CsvParseError on structural problems.
export function createRowBuilder(options = {}) {
  const headersOpt = options.headers !== undefined ? options.headers : true;
  const trim = options.trim || false;
  const maxRows = options.maxRows !== undefined ? options.maxRows : Infinity;
  const castRow = buildCaster(options.cast || false);

  let headers = null;      // resolved column names (null until first data row for headers:true)
  let cols = -1;           // expected column count
  let count = 0;           // data rows emitted so far
  let headersDone = false; // true once headers are resolved

  // pre-resolve custom headers array
  if (Array.isArray(headersOpt)) {
    headers = trim ? headersOpt.map((h) => h.trim()) : headersOpt.slice();
    const seen = new Set();
    for (const h of headers) {
      if (seen.has(h)) throw new TypeError(`Duplicate header name "${h}" in headers option.`);
      seen.add(h);
    }
    cols = headers.length;
    headersDone = true;
  } else if (headersOpt === false) {
    headersDone = true;
  }

  return function processRow(tokenRow) {
    const { fields, quoted, rowNumber } = tokenRow;

    // headers:true — first row becomes the header
    if (!headersDone) {
      headers = fields;
      const seen = new Set();
      for (const h of headers) {
        if (seen.has(h)) throw new CsvParseError(`Duplicate header name "${h}".`, rowNumber);
        seen.add(h);
      }
      cols = headers.length;
      headersDone = true;
      return null; // header row, no record emitted
    }

    // set expected column count from first data row when headers:false
    if (cols === -1) cols = fields.length;

    if (fields.length !== cols) {
      throw new CsvParseError(
        `Row ${rowNumber} has ${fields.length} fields but expected ${cols}.`,
        rowNumber
      );
    }

    if (count >= maxRows) {
      throw new CsvParseError(`Row limit of ${maxRows} exceeded.`, rowNumber);
    }

    count++;

    if (headersOpt === false) {
      return castRow ? castRow(fields, quoted, rowNumber, null) : fields;
    }

    const values = castRow ? castRow(fields, quoted, rowNumber, headers) : fields;
    const record = Object.create(null);
    for (let j = 0; j < headers.length; j++) record[headers[j]] = values[j];
    return record;
  };
}

export function buildRecords(rows, options = {}) {
  if (rows.length === 0) return [];

  const processRow = createRowBuilder(options);
  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const record = processRow(rows[i]);
    if (record !== null) result.push(record);
  }

  return result;
}
