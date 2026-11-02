/**
 * caster.js – Phase 3: type casting for csv-easy
 *
 * Exports a single factory that returns a castRow(fields, quoted, rowNumber, headers)
 * function, or null when casting is disabled.
 */

import { CsvParseError } from "./tokenizer.js";

// ─── Strict-match patterns ──────────────────────────────────────────────────

/** Matches strict decimal integers and floats: -0, 0, 123, -45, 3.14, -0.5 */
const NUMBER_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Matches strict ISO 8601 date (YYYY-MM-DD) or datetime (with optional ms and tz). */
const DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/;

// ─── Built-in rule implementations ──────────────────────────────────────────

/**
 * Try to cast a strict decimal number string.
 * Returns the number, or undefined if it should stay a string.
 */
function castNumber(value) {
  if (!NUMBER_RE.test(value)) return undefined;

  const n = Number(value);

  // Reject non-finite results (should never happen with the regex, but guard).
  if (!Number.isFinite(n)) return undefined;

  // If the value looks like an integer (no dot), it must be a safe integer.
  if (!value.includes(".")) {
    if (!Number.isSafeInteger(n)) return undefined;
  } else {
    // For floats, check round-trip: converting back to string must match
    // the original to ensure no precision loss.
    if (String(n) !== value) {
      return undefined;
    }
  }

  return n;
}

/**
 * Try to cast "true" / "false" to boolean.
 */
function castBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * Cast a strict ISO 8601 date string to a Date object.
 * Returns undefined if the string doesn't match or the date is invalid.
 */
function castDate(value) {
  if (!DATE_RE.test(value)) return undefined;

  const d = new Date(value);

  // Invalid date (e.g. 2024-02-31)
  if (Number.isNaN(d.getTime())) return undefined;

  // For date-only strings (YYYY-MM-DD), validate that the components match
  // to catch things like 2024-02-31 → Mar 2 rollover.
  if (!value.includes("T")) {
    const [y, m, day] = value.split("-").map(Number);
    if (
      d.getUTCFullYear() !== y ||
      d.getUTCMonth() + 1 !== m ||
      d.getUTCDate() !== day
    ) {
      return undefined;
    }
  } else {
    // For datetime strings, also validate the date part didn't roll over.
    const datePart = value.slice(0, 10);
    const [y, m, day] = datePart.split("-").map(Number);
    // Use the appropriate getter based on whether timezone info is present
    const hasTimezone = /Z|[+-]\d{2}:\d{2}$/.test(value);
    if (hasTimezone) {
      if (
        d.getUTCFullYear() !== y ||
        d.getUTCMonth() + 1 !== m ||
        d.getUTCDate() !== day
      ) {
        return undefined;
      }
    }
  }

  return d;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Resolve the `cast` option into a set of enabled built-in rules.
 *
 * @param {boolean|object} castOpt  The `cast` option value (true or per-rule object).
 * @returns {{ number: boolean, boolean: boolean, null: boolean, date: boolean }}
 */
function resolveRules(castOpt) {
  if (castOpt === true) {
    return { number: true, boolean: true, null: true, date: false };
  }
  // castOpt is a per-rule object
  return {
    number: castOpt.number !== undefined ? castOpt.number : true,
    boolean: castOpt.boolean !== undefined ? castOpt.boolean : true,
    null: castOpt.null !== undefined ? castOpt.null : true,
    date: castOpt.date !== undefined ? castOpt.date : false,
  };
}

/**
 * Apply built-in casting rules to a single unquoted value.
 */
function applyBuiltinRules(value, rules) {
  // null rule: empty unquoted field → null
  if (rules.null && value === "") return null;

  // boolean
  if (rules.boolean) {
    const b = castBoolean(value);
    if (b !== undefined) return b;
  }

  // number
  if (rules.number) {
    const n = castNumber(value);
    if (n !== undefined) return n;
  }

  // date (opt-in)
  if (rules.date) {
    const d = castDate(value);
    if (d !== undefined) return d;
  }

  return value;
}

/**
 * Build a castRow function from the `cast` option.
 *
 * @param {boolean|function|object} castOpt  The validated `cast` option.
 * @returns {function|null}  A castRow(fields, quotedFlags, rowNumber, headers) function,
 *   or null when casting is disabled.
 */
export function buildCaster(castOpt) {
  if (!castOpt) return null;

  // ── Custom function ────────────────────────────────────────────────────
  if (typeof castOpt === "function") {
    /**
     * @param {string[]} fields
     * @param {boolean[]} quotedFlags
     * @param {number} rowNumber  1-based
     * @param {string[]|null} headers  null when headers: false
     */
    return function castRowCustom(fields, quotedFlags, rowNumber, headers) {
      const result = new Array(fields.length);
      for (let i = 0; i < fields.length; i++) {
        const column = headers ? headers[i] : i;
        const context = {
          column,
          index: i,
          row: rowNumber,
          quoted: quotedFlags[i],
        };
        try {
          result[i] = castOpt(fields[i], context);
        } catch (err) {
          throw new CsvParseError(
            `Cast function error at row ${rowNumber}, column "${column}": ${err.message}`,
            rowNumber
          );
        }
      }
      return result;
    };
  }

  // ── Built-in rules (true or per-rule object) ──────────────────────────
  const rules = resolveRules(castOpt);

  return function castRowBuiltin(fields, quotedFlags, _rowNumber, _headers) {
    const result = new Array(fields.length);
    for (let i = 0; i < fields.length; i++) {
      // Quoted fields are never auto-cast.
      if (quotedFlags[i]) {
        result[i] = fields[i];
      } else {
        result[i] = applyBuiltinRules(fields[i], rules);
      }
    }
    return result;
  };
}

