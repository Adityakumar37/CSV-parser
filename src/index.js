/**
 * csv-easy – public API (Phase 1)
 *
 * Only re-exports.  All parsing logic lives in tokenizer.js and parser.js.
 */

import { Tokenizer, CsvParseError } from "./tokenizer.js";
import { buildRecords } from "./parser.js";

export { CsvParseError };

/**
 * Parse a CSV string and return an array of records.
 *
 * Each record is an object whose keys are the header names and whose values
 * are strings.  Records have a null prototype (see parser.js for why).
 *
 * @param {string}  input     The full CSV text.
 * @param {object}  [options] Reserved for Phase 2; currently unused.
 * @returns {Array<object>}
 * @throws {TypeError}       When `input` is not a string.
 * @throws {CsvParseError}   For malformed CSV or structural problems.
 */
export function parseCSV(input, options = {}) {
  if (typeof input !== "string") {
    throw new TypeError(
      `parseCSV expects a string but received ${typeof input}.`
    );
  }

  // Fast-path: whitespace-only input produces no records.
  if (input.trim() === "") return [];

  const tokenizer = new Tokenizer();
  tokenizer.feed(input);
  tokenizer.finish();

  return buildRecords(tokenizer.rows);
}
