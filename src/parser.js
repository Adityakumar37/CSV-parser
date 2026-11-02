import { CsvParseError } from "./tokenizer.js";
import { buildCaster } from "./caster.js";

/**
 * Build records or raw rows from the tokenizer's rows.
 *
 * @param {Array<{fields: string[], quoted: boolean[], rowNumber: number}>} rows
 *   Output of the Tokenizer.
 * @param {object} [options]
 * @returns {Array<object|Array<any>>}
 * @throws {CsvParseError} On duplicate headers, mismatched field counts, or maxRows exceeded.
 */
export function buildRecords(rows, options = {}) {
  const {
    headers: headersOpt = true,
    trim = false,
    maxRows = Infinity,
    cast: castOpt = false,
  } = options;

  if (rows.length === 0) return [];

  const castRow = buildCaster(castOpt);

  // ── Mode: headers === false ───────────────────────────────────────────────
  if (headersOpt === false) {
    const expectedCols = rows[0].fields.length;
    const result = [];

    for (let i = 0; i < rows.length; i++) {
      const { fields, quoted, rowNumber } = rows[i];

      if (fields.length !== expectedCols) {
        throw new CsvParseError(
          `Row ${rowNumber} has ${fields.length} fields but expected ${expectedCols}.`,
          rowNumber
        );
      }

      if (result.length >= maxRows) {
        throw new CsvParseError(
          `Row limit of ${maxRows} exceeded.`,
          rowNumber
        );
      }

      if (castRow) {
        result.push(castRow(fields, quoted, rowNumber, null));
      } else {
        result.push(fields);
      }
    }

    return result;
  }

  // ── Mode: headers is custom array (string[]) ──────────────────────────────
  if (Array.isArray(headersOpt)) {
    const headers = trim ? headersOpt.map((h) => h.trim()) : [...headersOpt];
    const seen = new Set();
    for (const h of headers) {
      if (seen.has(h)) {
        throw new TypeError(`Duplicate header name "${h}" in headers option.`);
      }
      seen.add(h);
    }
    const expectedCols = headers.length;
    const records = [];

    for (let i = 0; i < rows.length; i++) {
      const { fields, quoted, rowNumber } = rows[i];

      if (fields.length !== expectedCols) {
        throw new CsvParseError(
          `Row ${rowNumber} has ${fields.length} fields but expected ${expectedCols}.`,
          rowNumber
        );
      }

      if (records.length >= maxRows) {
        throw new CsvParseError(
          `Row limit of ${maxRows} exceeded.`,
          rowNumber
        );
      }

      const values = castRow
        ? castRow(fields, quoted, rowNumber, headers)
        : fields;

      const record = Object.create(null);
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = values[j];
      }
      records.push(record);
    }

    return records;
  }

  // ── Mode: headers === true (default) ──────────────────────────────────────
  const headerRow = rows[0];
  const headers = headerRow.fields;

  // Duplicate headers would silently drop a column – disallow them.
  const seen = new Set();
  for (const h of headers) {
    if (seen.has(h)) {
      throw new CsvParseError(
        `Duplicate header name "${h}".`,
        headerRow.rowNumber
      );
    }
    seen.add(h);
  }

  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const { fields, quoted, rowNumber } = rows[i];

    if (fields.length !== headers.length) {
      throw new CsvParseError(
        `Row ${rowNumber} has ${fields.length} fields but expected ${headers.length}.`,
        rowNumber
      );
    }

    if (records.length >= maxRows) {
      throw new CsvParseError(
        `Row limit of ${maxRows} exceeded.`,
        rowNumber
      );
    }

    const values = castRow
      ? castRow(fields, quoted, rowNumber, headers)
      : fields;

    const record = Object.create(null);
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j];
    }

    records.push(record);
  }

  return records;
}
