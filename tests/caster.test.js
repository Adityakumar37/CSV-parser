import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, CsvParseError } from "../src/index.js";

const plain = (rows) => rows.map((r) => ({ ...r }));

// ────────────────────────────────────────────────────────────────────────────
// 1. Default behaviour: cast disabled (Phase 1/2 unchanged)
// ────────────────────────────────────────────────────────────────────────────
describe("cast: default (false)", () => {
  it("all values stay strings when cast is not specified", () => {
    const csv = "name,age,active\nAditya,18,true";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18", active: "true" },
    ]);
  });

  it("all values stay strings when cast is explicitly false", () => {
    const csv = "a,b\n42,false";
    const result = parseCSV(csv, { cast: false });
    assert.deepStrictEqual(plain(result), [{ a: "42", b: "false" }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Number casting
// ────────────────────────────────────────────────────────────────────────────
describe("cast: number rule", () => {
  it('casts "18" to 18', () => {
    const r = parseCSV("a\n18", { cast: true });
    assert.strictEqual(r[0].a, 18);
  });

  it('casts "0" to 0', () => {
    const r = parseCSV("a\n0", { cast: true });
    assert.strictEqual(r[0].a, 0);
  });

  it('casts "-5" to -5', () => {
    const r = parseCSV("a\n-5", { cast: true });
    assert.strictEqual(r[0].a, -5);
  });

  it('casts "3.14" to 3.14', () => {
    const r = parseCSV("a\n3.14", { cast: true });
    assert.strictEqual(r[0].a, 3.14);
  });

  it('casts "-0.5" to -0.5', () => {
    const r = parseCSV("a\n-0.5", { cast: true });
    assert.strictEqual(r[0].a, -0.5);
  });

  // ── Non-matching edge cases ───────────────────────────────────────────
  it('"007" stays string (leading zero)', () => {
    const r = parseCSV("a\n007", { cast: true });
    assert.strictEqual(r[0].a, "007");
  });

  it('"1e5" stays string (scientific notation)', () => {
    const r = parseCSV("a\n1e5", { cast: true });
    assert.strictEqual(r[0].a, "1e5");
  });

  it('"0x10" stays string (hex)', () => {
    const r = parseCSV("a\n0x10", { cast: true });
    assert.strictEqual(r[0].a, "0x10");
  });

  it('"+5" stays string (leading plus)', () => {
    const r = parseCSV("a\n+5", { cast: true });
    assert.strictEqual(r[0].a, "+5");
  });

  it('"1,000" stays string (contains comma — parsed as separate fields with headers:false)', () => {
    // With default delimiter, "1,000" splits into two fields. Test with semicolon.
    const r = parseCSV("a\n1,000", { cast: true, delimiter: ";" });
    assert.strictEqual(r[0].a, "1,000");
  });

  it('" 12" stays string (leading space, no trim)', () => {
    const r = parseCSV("a\n 12", { cast: true });
    assert.strictEqual(r[0].a, " 12");
  });

  it("large integer ID stays string (unsafe integer)", () => {
    const r = parseCSV("a\n12345678901234567890", { cast: true });
    assert.strictEqual(r[0].a, "12345678901234567890");
  });

  it("Number.MAX_SAFE_INTEGER is cast", () => {
    const r = parseCSV(`a\n${Number.MAX_SAFE_INTEGER}`, { cast: true });
    assert.strictEqual(r[0].a, Number.MAX_SAFE_INTEGER);
  });

  it("Number.MAX_SAFE_INTEGER + 1 stays string", () => {
    const big = String(Number.MAX_SAFE_INTEGER + 2); // 9007199254740993
    // This may or may not equal the original string due to precision; but the
    // value we put in the CSV is the literal digits, which won't round-trip.
    const r = parseCSV(`a\n9007199254740993`, { cast: true });
    assert.strictEqual(r[0].a, "9007199254740993");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Boolean casting
// ────────────────────────────────────────────────────────────────────────────
describe("cast: boolean rule", () => {
  it('"true" becomes true', () => {
    const r = parseCSV("a\ntrue", { cast: true });
    assert.strictEqual(r[0].a, true);
  });

  it('"false" becomes false', () => {
    const r = parseCSV("a\nfalse", { cast: true });
    assert.strictEqual(r[0].a, false);
  });

  it('"True" stays string (case-sensitive)', () => {
    const r = parseCSV("a\nTrue", { cast: true });
    assert.strictEqual(r[0].a, "True");
  });

  it('"FALSE" stays string (case-sensitive)', () => {
    const r = parseCSV("a\nFALSE", { cast: true });
    assert.strictEqual(r[0].a, "FALSE");
  });

  it('"yes" stays string', () => {
    const r = parseCSV("a\nyes", { cast: true });
    assert.strictEqual(r[0].a, "yes");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Null casting – empty unquoted vs quoted empty
// ────────────────────────────────────────────────────────────────────────────
describe("cast: null rule", () => {
  it("empty unquoted field becomes null", () => {
    const r = parseCSV("a,b\n1,", { cast: true });
    assert.strictEqual(r[0].b, null);
  });

  it('quoted empty field "" stays ""', () => {
    const r = parseCSV('a,b\n1,""', { cast: true });
    assert.strictEqual(r[0].b, "");
  });

  it("empty unquoted with headers:false becomes null", () => {
    const r = parseCSV("1,", { cast: true, headers: false });
    assert.strictEqual(r[0][1], null);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Date casting (opt-in only)
// ────────────────────────────────────────────────────────────────────────────
describe("cast: date rule", () => {
  it("date is NOT cast with cast: true (date defaults to false)", () => {
    const r = parseCSV("a\n2024-06-15", { cast: true });
    assert.strictEqual(r[0].a, "2024-06-15");
  });

  it("date is cast when explicitly opted in", () => {
    const r = parseCSV("a\n2024-06-15", { cast: { date: true } });
    assert.ok(r[0].a instanceof Date);
    assert.strictEqual(r[0].a.toISOString().slice(0, 10), "2024-06-15");
  });

  it("full ISO datetime with Z is cast", () => {
    const r = parseCSV("a\n2024-06-15T10:30:00Z", { cast: { date: true } });
    assert.ok(r[0].a instanceof Date);
    assert.strictEqual(r[0].a.toISOString(), "2024-06-15T10:30:00.000Z");
  });

  it("full ISO datetime with offset is cast", () => {
    const r = parseCSV("a\n2024-06-15T10:30:00+05:30", {
      cast: { date: true },
    });
    assert.ok(r[0].a instanceof Date);
  });

  it("full ISO datetime with milliseconds is cast", () => {
    const r = parseCSV("a\n2024-06-15T10:30:00.123Z", {
      cast: { date: true },
    });
    assert.ok(r[0].a instanceof Date);
    assert.strictEqual(r[0].a.getUTCMilliseconds(), 123);
  });

  it("invalid date 2024-02-31 stays string", () => {
    const r = parseCSV("a\n2024-02-31", { cast: { date: true } });
    assert.strictEqual(r[0].a, "2024-02-31");
  });

  it("non-ISO date format stays string", () => {
    const r = parseCSV("a\n06/15/2024", { cast: { date: true } });
    assert.strictEqual(r[0].a, "06/15/2024");
  });

  it("date-like partial string stays string", () => {
    const r = parseCSV("a\n2024-6-15", { cast: { date: true } });
    assert.strictEqual(r[0].a, "2024-6-15");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Quoted fields are never auto-cast
// ────────────────────────────────────────────────────────────────────────────
describe("cast: quoted fields stay strings", () => {
  it('quoted "18" stays the string "18"', () => {
    const r = parseCSV('a\n"18"', { cast: true });
    assert.strictEqual(r[0].a, "18");
    assert.strictEqual(typeof r[0].a, "string");
  });

  it('quoted "true" stays the string "true"', () => {
    const r = parseCSV('a\n"true"', { cast: true });
    assert.strictEqual(r[0].a, "true");
    assert.strictEqual(typeof r[0].a, "string");
  });

  it('quoted "" stays "" (not null)', () => {
    const r = parseCSV('a\n""', { cast: true });
    assert.strictEqual(r[0].a, "");
    assert.strictEqual(typeof r[0].a, "string");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Header names are never cast
// ────────────────────────────────────────────────────────────────────────────
describe("cast: headers are never cast", () => {
  it("header named 'true' stays string key", () => {
    const r = parseCSV("true,false\n1,2", { cast: true });
    const keys = Object.keys(r[0]);
    assert.ok(keys.includes("true"));
    assert.ok(keys.includes("false"));
    assert.strictEqual(r[0]["true"], 1);
    assert.strictEqual(r[0]["false"], 2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. Per-rule object form
// ────────────────────────────────────────────────────────────────────────────
describe("cast: per-rule object", () => {
  it("only number enabled", () => {
    const r = parseCSV("a,b,c\n42,true,", {
      cast: { number: true, boolean: false, null: false },
    });
    assert.strictEqual(r[0].a, 42);
    assert.strictEqual(r[0].b, "true"); // boolean disabled
    assert.strictEqual(r[0].c, ""); // null disabled
  });

  it("only boolean enabled", () => {
    const r = parseCSV("a,b,c\n42,true,", {
      cast: { number: false, boolean: true, null: false },
    });
    assert.strictEqual(r[0].a, "42"); // number disabled
    assert.strictEqual(r[0].b, true);
    assert.strictEqual(r[0].c, ""); // null disabled
  });

  it("only null enabled", () => {
    const r = parseCSV("a,b,c\n42,true,", {
      cast: { number: false, boolean: false, null: true },
    });
    assert.strictEqual(r[0].a, "42");
    assert.strictEqual(r[0].b, "true");
    assert.strictEqual(r[0].c, null);
  });

  it("unspecified keys default correctly (number/boolean/null: true, date: false)", () => {
    const r = parseCSV("a,b,c,d\n42,true,,2024-06-15", { cast: {} });
    assert.strictEqual(r[0].a, 42); // number defaults true
    assert.strictEqual(r[0].b, true); // boolean defaults true
    assert.strictEqual(r[0].c, null); // null defaults true
    assert.strictEqual(r[0].d, "2024-06-15"); // date defaults false
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. Custom cast function
// ────────────────────────────────────────────────────────────────────────────
describe("cast: custom function", () => {
  it("receives correct context for each field", () => {
    const contexts = [];
    parseCSV('name,age\nAditya,"18"', {
      cast: (value, ctx) => {
        contexts.push({ ...ctx });
        return value;
      },
    });
    // Data row is row 2 (row 1 is header).
    assert.strictEqual(contexts.length, 2);

    // First field: unquoted "Aditya"
    assert.deepStrictEqual(contexts[0], {
      column: "name",
      index: 0,
      row: 2,
      quoted: false,
    });

    // Second field: quoted "18"
    assert.deepStrictEqual(contexts[1], {
      column: "age",
      index: 1,
      row: 2,
      quoted: true,
    });
  });

  it("custom function can cast quoted fields", () => {
    const r = parseCSV('a\n"42"', {
      cast: (value, ctx) => (ctx.quoted ? Number(value) : value),
    });
    assert.strictEqual(r[0].a, 42);
  });

  it("custom function return value replaces the field", () => {
    const r = parseCSV("a,b\nhello,world", {
      cast: (value) => value.toUpperCase(),
    });
    assert.deepStrictEqual(plain(r), [{ a: "HELLO", b: "WORLD" }]);
  });

  it("custom function with headers: false gets index as column", () => {
    const contexts = [];
    parseCSV("foo,bar", {
      headers: false,
      cast: (value, ctx) => {
        contexts.push({ ...ctx });
        return value;
      },
    });
    assert.strictEqual(contexts[0].column, 0);
    assert.strictEqual(contexts[1].column, 1);
  });

  it("custom function throwing wraps in CsvParseError", () => {
    assert.throws(
      () =>
        parseCSV("a\nfoo", {
          cast: () => {
            throw new Error("boom");
          },
        }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 2 &&
        /boom/.test(err.message) &&
        /column "a"/.test(err.message)
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. headers: false with cast
// ────────────────────────────────────────────────────────────────────────────
describe("cast with headers: false", () => {
  it("casts all rows including what would be the header row", () => {
    const r = parseCSV("1,2\n3,4", { headers: false, cast: true });
    assert.deepStrictEqual(r, [
      [1, 2],
      [3, 4],
    ]);
  });

  it("null rule works on empty unquoted with headers: false", () => {
    const r = parseCSV("a,\n1,", { headers: false, cast: true });
    assert.strictEqual(r[0][1], null);
    assert.strictEqual(r[1][1], null);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. Custom headers array with cast
// ────────────────────────────────────────────────────────────────────────────
describe("cast with custom headers array", () => {
  it("casts data rows using custom headers", () => {
    const r = parseCSV("42,true", {
      headers: ["num", "flag"],
      cast: true,
    });
    assert.deepStrictEqual(plain(r), [{ num: 42, flag: true }]);
  });

  it("custom cast function gets custom header names as column", () => {
    const cols = [];
    parseCSV("42,hello", {
      headers: ["x", "y"],
      cast: (v, ctx) => {
        cols.push(ctx.column);
        return v;
      },
    });
    assert.deepStrictEqual(cols, ["x", "y"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. Validation: invalid cast option values
// ────────────────────────────────────────────────────────────────────────────
describe("Validation: cast option", () => {
  it("throws TypeError for cast: 'true' (string)", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: "true" }),
      (err) => err instanceof TypeError && /cast/.test(err.message)
    );
  });

  it("throws TypeError for cast: 1 (number)", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: 1 }),
      (err) => err instanceof TypeError && /cast/.test(err.message)
    );
  });

  it("throws TypeError for cast: null", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: null }),
      (err) => err instanceof TypeError && /cast/.test(err.message)
    );
  });

  it("throws TypeError for cast: [] (array)", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: [] }),
      (err) => err instanceof TypeError && /cast/.test(err.message)
    );
  });

  it("throws TypeError for unknown rule key in cast object", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: { number: true, integer: true } }),
      (err) => err instanceof TypeError && /integer/.test(err.message)
    );
  });

  it("throws TypeError for non-boolean rule value in cast object", () => {
    assert.throws(
      () => parseCSV("a\n1", { cast: { number: "yes" } }),
      (err) => err instanceof TypeError && /number/.test(err.message)
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 13. Combined: cast with other options
// ────────────────────────────────────────────────────────────────────────────
describe("cast combined with other options", () => {
  it("cast + trim: trimmed value is then cast", () => {
    const r = parseCSV("a\n  42  ", { cast: true, trim: true });
    assert.strictEqual(r[0].a, 42);
  });

  it("cast + skipEmptyLines + null", () => {
    const r = parseCSV("a\n\n1\n\n", { cast: true, skipEmptyLines: true });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].a, 1);
  });

  it("cast + maxRows still enforces limit", () => {
    assert.throws(
      () => parseCSV("a\n1\n2\n3", { cast: true, maxRows: 2 }),
      CsvParseError
    );
  });

  it("cast + custom delimiter", () => {
    const r = parseCSV("a;b\n42;true", { cast: true, delimiter: ";" });
    assert.deepStrictEqual(plain(r), [{ a: 42, b: true }]);
  });
});

