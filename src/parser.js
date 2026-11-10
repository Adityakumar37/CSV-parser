import { CsvParseError } from "./tokenizer.js";
import { buildCaster } from "./caster.js";

export function buildRecords(rows, options = {}) {
  const {
    headers: headersOpt = true,
    trim = false,
    maxRows = Infinity,
    cast: castOpt = false,
  } = options;

  if (rows.length === 0) return [];

  const castRow = buildCaster(castOpt);

  if (headersOpt === false) {
    const cols = rows[0].fields.length;
    const result = [];

    for (let i = 0; i < rows.length; i++) {
      const { fields, quoted, rowNumber } = rows[i];

      if (fields.length !== cols) {
        throw new CsvParseError(
          `Row ${rowNumber} has ${fields.length} fields but expected ${cols}.`,
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

  if (Array.isArray(headersOpt)) {
    const headers = trim ? headersOpt.map((h) => h.trim()) : [...headersOpt];
    const seen = new Set();
    for (const h of headers) {
      if (seen.has(h)) {
        throw new TypeError(`Duplicate header name "${h}" in headers option.`);
      }
      seen.add(h);
    }
    const cols = headers.length;
    const records = [];

    for (let i = 0; i < rows.length; i++) {
      const { fields, quoted, rowNumber } = rows[i];

      if (fields.length !== cols) {
        throw new CsvParseError(
          `Row ${rowNumber} has ${fields.length} fields but expected ${cols}.`,
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

  const headerRow = rows[0];
  const headers = headerRow.fields;

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
