import { CsvParseError } from "./tokenizer.js";

/**
 * Build an array of plain objects from the tokenizer's rows.
 *
 * Row 1 is always the header row.  Every subsequent non-blank row is mapped
 * to an object whose keys come from the headers.
 *
 * @param {Array<{fields: string[], rowNumber: number}>} rows
 *   Output of the Tokenizer – already filtered for blank lines.
 * @returns {Array<object>}  Records with a null prototype (no prototype pollution).
 * @throws {CsvParseError}  On duplicate headers or mismatched field counts.
 */
export function buildRecords(rows) {
  if (rows.length === 0) return [];

  // ── Extract and validate headers ──────────────────────────────────────────

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

  // ── Map data rows to records ───────────────────────────────────────────────

  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const { fields, rowNumber } = rows[i];

    if (fields.length !== headers.length) {
      throw new CsvParseError(
        `Row ${rowNumber} has ${fields.length} fields but expected ${headers.length}.`,
        rowNumber
      );
    }

    // Object.create(null) gives a truly prototype-free object.
    // A header named "__proto__" becomes a regular own property, not a
    // prototype mutation.
    const record = Object.create(null);
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = fields[j];
    }

    records.push(record);
  }

  return records;
}
