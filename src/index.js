import { Tokenizer, CsvParseError } from "./tokenizer.js";
import { buildRecords } from "./parser.js";
import { validateOptions } from "./options.js";

export { CsvParseError };

/** Parse CSV text. */
export function parseCSV(input, options = {}) {
  if (typeof input !== "string") {
    throw new TypeError(
      `parseCSV expects a string but received ${typeof input}.`
    );
  }

  validateOptions(options);

  if (input === "") return [];

  const tokenizer = new Tokenizer(options);
  const rows = tokenizer.feed(input);
  const finalRows = tokenizer.finish();
  const allRows = rows.concat(finalRows);

  return buildRecords(allRows, options);
}
