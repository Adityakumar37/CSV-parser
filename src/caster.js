import { CsvParseError } from "./tokenizer.js";

const NUMBER_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/;

function tryNumber(val) {
  if (!NUMBER_RE.test(val)) return undefined;
  const n = Number(val);
  if (!Number.isFinite(n)) return undefined;
  if (!val.includes(".")) {
    if (!Number.isSafeInteger(n)) return undefined;
  } else {
    // round-trip check: catch floats that lose precision
    if (String(n) !== val) return undefined;
  }
  return n;
}

function tryDate(val) {
  if (!DATE_RE.test(val)) return undefined;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return undefined;
  // check date components didn't roll over (e.g. 2024-02-31 -> Mar 2)
  const [y, m, day] = val.slice(0, 10).split("-").map(Number);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    return undefined;
  }
  return d;
}

function applyRules(val, rules) {
  if (rules.null && val === "") return null;
  if (rules.boolean && val === "true") return true;
  if (rules.boolean && val === "false") return false;
  if (rules.number) {
    const n = tryNumber(val);
    if (n !== undefined) return n;
  }
  if (rules.date) {
    const d = tryDate(val);
    if (d !== undefined) return d;
  }
  return val;
}

function resolveRules(opt) {
  if (opt === true) return { number: true, boolean: true, null: true, date: false };
  return {
    number: opt.number !== undefined ? opt.number : true,
    boolean: opt.boolean !== undefined ? opt.boolean : true,
    null: opt.null !== undefined ? opt.null : true,
    date: opt.date !== undefined ? opt.date : false,
  };
}

export function buildCaster(opt) {
  if (!opt) return null;

  if (typeof opt === "function") {
    return function castRow(fields, quoted, rowNumber, headers) {
      const result = [];
      for (let i = 0; i < fields.length; i++) {
        const column = headers ? headers[i] : i;
        try {
          result.push(opt(fields[i], { column, index: i, row: rowNumber, quoted: quoted[i] }));
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

  const rules = resolveRules(opt);
  return function castRow(fields, quoted) {
    const result = [];
    for (let i = 0; i < fields.length; i++) {
      // quoted fields are never auto-cast
      result.push(quoted[i] ? fields[i] : applyRules(fields[i], rules));
    }
    return result;
  };
}
