const VALID_OPTIONS = new Set([
  "delimiter",
  "quote",
  "trim",
  "headers",
  "skipEmptyLines",
  "maxRows",
  "cast",
  "maxBytes",
  "property",
  "timeout",
]);

function validateOptions(options) {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("Options must be an object.");
  }

  for (const key of Object.keys(options)) {
    if (!VALID_OPTIONS.has(key)) {
      throw new TypeError(`Unknown option "${key}".`);
    }
  }

  if ("delimiter" in options) {
    if (typeof options.delimiter !== "string" || options.delimiter.length !== 1) {
      throw new TypeError('Option "delimiter" must be a single character string.');
    }
    if (
      options.delimiter === '"' ||
      options.delimiter === "\r" ||
      options.delimiter === "\n"
    ) {
      throw new TypeError(
        'Option "delimiter" cannot be a quote or newline character.'
      );
    }
  }

  if ("quote" in options) {
    if (typeof options.quote !== "string" || options.quote.length !== 1) {
      throw new TypeError('Option "quote" must be a single character string.');
    }
    if (options.quote === "\r" || options.quote === "\n") {
      throw new TypeError('Option "quote" cannot be a newline character.');
    }
  }

  const delimiter = options.delimiter !== undefined ? options.delimiter : ",";
  const quote = options.quote !== undefined ? options.quote : '"';
  if (delimiter === quote) {
    throw new TypeError('Option "quote" must differ from delimiter.');
  }

  if ("trim" in options && typeof options.trim !== "boolean") {
    throw new TypeError('Option "trim" must be a boolean.');
  }

  if ("headers" in options) {
    if (typeof options.headers !== "boolean") {
      if (
        !Array.isArray(options.headers) ||
        options.headers.length === 0 ||
        !options.headers.every((h) => typeof h === "string")
      ) {
        throw new TypeError(
          'Option "headers" must be a boolean or a non-empty array of strings.'
        );
      }
      const headersToCheck = options.trim
        ? options.headers.map((h) => h.trim())
        : options.headers;
      const seen = new Set();
      for (const h of headersToCheck) {
        if (seen.has(h)) {
          throw new TypeError(
            `Duplicate header name "${h}" in headers option.`
          );
        }
        seen.add(h);
      }
    }
  }

  if (
    "skipEmptyLines" in options &&
    typeof options.skipEmptyLines !== "boolean"
  ) {
    throw new TypeError('Option "skipEmptyLines" must be a boolean.');
  }

  if ("maxRows" in options) {
    if (
      typeof options.maxRows !== "number" ||
      Number.isNaN(options.maxRows) ||
      options.maxRows < 0
    ) {
      throw new TypeError('Option "maxRows" must be a non-negative number.');
    }
  }

  for (const key of ["maxBytes", "timeout"]) {
    if (key in options && (typeof options[key] !== "number" || !Number.isFinite(options[key]) || options[key] < 0)) {
      throw new TypeError(`Option "${key}" must be a non-negative number.`);
    }
  }

  if ("property" in options && (typeof options.property !== "string" || options.property.length === 0)) {
    throw new TypeError('Option "property" must be a non-empty string.');
  }

  if ("cast" in options) {
    const c = options.cast;
    if (typeof c === "boolean" || typeof c === "function") {
      // Valid: false disables, true enables defaults, function is custom.
    } else if (typeof c === "object" && c !== null && !Array.isArray(c)) {
      const VALID_CAST_KEYS = new Set(["number", "boolean", "null", "date"]);
      for (const key of Object.keys(c)) {
        if (!VALID_CAST_KEYS.has(key)) {
          throw new TypeError(
            `Unknown cast rule "${key}". Valid rules: number, boolean, null, date.`
          );
        }
        if (typeof c[key] !== "boolean") {
          throw new TypeError(
            `Cast rule "${key}" must be a boolean.`
          );
        }
      }
    } else {
      throw new TypeError(
        'Option "cast" must be a boolean, a function, or an object with rule flags.'
      );
    }
  }
}

export { validateOptions };
