import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, CsvParseError } from "../src/index.js";

/**
 * Records have a null prototype (Object.create(null)).
 * assert.deepStrictEqual compares prototypes, so convert to plain objects
 * before comparison.
 */
const plain = (rows) => rows.map((r) => ({ ...r }));

// ────────────────────────────────────────────────────────────────────────────
// 1. Basic CSV
// ────────────────────────────────────────────────────────────────────────────
describe("Basic CSV", () => {
  it("parses a simple CSV string", () => {
    const csv = "name,age,city\nAditya,18,Pune\nRahul,20,Delhi\nAman,19,Mumbai";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18", city: "Pune" },
      { name: "Rahul", age: "20", city: "Delhi" },
      { name: "Aman", age: "19", city: "Mumbai" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Multiple rows
// ────────────────────────────────────────────────────────────────────────────
describe("Multiple rows", () => {
  it("returns one object per data row", () => {
    const csv = "a,b\n1,2\n3,4\n5,6";
    const result = parseCSV(csv);
    assert.equal(result.length, 3);
    assert.deepStrictEqual(plain(result), [
      { a: "1", b: "2" },
      { a: "3", b: "4" },
      { a: "5", b: "6" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Empty fields
// ────────────────────────────────────────────────────────────────────────────
describe("Empty fields", () => {
  it("preserves empty fields as empty strings", () => {
    const csv = "name,age,city\nAditya,,Pune";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "", city: "Pune" },
    ]);
  });

  it("handles trailing delimiter (last field empty)", () => {
    const csv = "a,b,c\n1,2,";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [{ a: "1", b: "2", c: "" }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Quoted fields
// ────────────────────────────────────────────────────────────────────────────
describe("Quoted fields", () => {
  it("strips the surrounding quotes", () => {
    const csv = 'name,city\n"Aditya","Pune"';
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [{ name: "Aditya", city: "Pune" }]);
  });

  it("handles a quoted empty field", () => {
    const csv = 'name,age\nAditya,""';
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [{ name: "Aditya", age: "" }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Commas inside quotes
// ────────────────────────────────────────────────────────────────────────────
describe("Commas inside quotes", () => {
  it("treats commas inside quoted fields as literal text", () => {
    const csv = 'name,address\nAditya,"Pune, Maharashtra"';
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", address: "Pune, Maharashtra" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Escaped quotes ("")
// ────────────────────────────────────────────────────────────────────────────
describe("Escaped quotes", () => {
  it('collapses "" inside a quoted field into a single "', () => {
    const csv = 'greeting\n"Hello ""world"""';
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [{ greeting: 'Hello "world"' }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7–9. Line-ending variants
// ────────────────────────────────────────────────────────────────────────────
describe("Line endings", () => {
  const expected = [
    { name: "Aditya", age: "18" },
    { name: "Rahul", age: "20" },
  ];

  it("handles \\n line endings", () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    assert.deepStrictEqual(plain(parseCSV(csv)), expected);
  });

  it("handles \\r\\n line endings", () => {
    const csv = "name,age\r\nAditya,18\r\nRahul,20";
    assert.deepStrictEqual(plain(parseCSV(csv)), expected);
  });

  it("handles lone \\r line endings", () => {
    const csv = "name,age\rAditya,18\rRahul,20";
    assert.deepStrictEqual(plain(parseCSV(csv)), expected);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. Inconsistent column counts
// ────────────────────────────────────────────────────────────────────────────
describe("Inconsistent column counts", () => {
  it("throws CsvParseError with the correct message and row number", () => {
    const csv = "name,age\nAditya,18,Pune";
    try {
      parseCSV(csv);
      assert.fail("Expected CsvParseError to be thrown");
    } catch (err) {
      assert.ok(err instanceof CsvParseError, "should be CsvParseError");
      assert.equal(err.message, "Row 2 has 3 fields but expected 2.");
      assert.equal(err.row, 2);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. Empty / whitespace-only input
// ────────────────────────────────────────────────────────────────────────────
describe("Empty and whitespace-only input", () => {
  it("returns [] for an empty string", () => {
    assert.deepStrictEqual(parseCSV(""), []);
  });

  it("returns [] for a whitespace-only string", () => {
    assert.deepStrictEqual(parseCSV("   \t  "), []);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. Header-only input
// ────────────────────────────────────────────────────────────────────────────
describe("Header-only input", () => {
  it("returns [] when there are no data rows", () => {
    assert.deepStrictEqual(parseCSV("name,age"), []);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 13. Newline inside a quoted field
// ────────────────────────────────────────────────────────────────────────────
describe("Newline inside a quoted field", () => {
  it("preserves the newline as part of the field value", () => {
    const csv = 'name,bio\nAditya,"line one\nline two"';
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", bio: "line one\nline two" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 14. Trailing newline
// ────────────────────────────────────────────────────────────────────────────
describe("Trailing newline", () => {
  it("trailing newline and no trailing newline give the same result", () => {
    const withNewline    = "name,age\nAditya,18\n";
    const withoutNewline = "name,age\nAditya,18";
    assert.deepStrictEqual(
      plain(parseCSV(withNewline)),
      plain(parseCSV(withoutNewline))
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 15. Blank lines in the middle
// ────────────────────────────────────────────────────────────────────────────
describe("Blank lines", () => {
  it("skips blank lines and does not count them as rows", () => {
    const csv = "name,age\n\nAditya,18\n\nRahul,20";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18" },
      { name: "Rahul", age: "20" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 16. Unterminated quote
// ────────────────────────────────────────────────────────────────────────────
describe("Unterminated quote", () => {
  it("throws CsvParseError", () => {
    const csv = 'name\n"abc';
    try {
      parseCSV(csv);
      assert.fail("Expected CsvParseError");
    } catch (err) {
      assert.ok(err instanceof CsvParseError);
      assert.equal(err.name, "CsvParseError");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 17. Characters after a closing quote
// ────────────────────────────────────────────────────────────────────────────
describe("Characters after closing quote", () => {
  it("throws CsvParseError", () => {
    const csv = 'name\n"abc"def';
    try {
      parseCSV(csv);
      assert.fail("Expected CsvParseError");
    } catch (err) {
      assert.ok(err instanceof CsvParseError);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 18. BOM stripping
// ────────────────────────────────────────────────────────────────────────────
describe("BOM stripping", () => {
  it("strips a leading BOM so the first header has no \\uFEFF", () => {
    const csv = "\uFEFFname,age\nAditya,18";
    const result = parseCSV(csv);
    // First key should be "name", not "\uFEFFname"
    const keys = Object.keys(result[0]);
    assert.equal(keys[0], "name");
    assert.deepStrictEqual(plain(result), [{ name: "Aditya", age: "18" }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 19. Duplicate headers
// ────────────────────────────────────────────────────────────────────────────
describe("Duplicate headers", () => {
  it("throws CsvParseError when headers repeat", () => {
    const csv = "name,name\nAditya,18";
    try {
      parseCSV(csv);
      assert.fail("Expected CsvParseError");
    } catch (err) {
      assert.ok(err instanceof CsvParseError);
      assert.equal(err.name, "CsvParseError");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 20. __proto__ header does not pollute Object.prototype
// ────────────────────────────────────────────────────────────────────────────
describe("Prototype safety", () => {
  it("a header named __proto__ does not pollute Object.prototype", () => {
    const csv = "__proto__,age\nAditya,18";
    const result = parseCSV(csv);
    // Object.prototype should be untouched
    assert.equal(({}).age, undefined);
    // The record itself should have the value as an own property
    assert.equal(Object.prototype.hasOwnProperty.call(result[0], "__proto__"), true);
    assert.equal(result[0]["__proto__"], "Aditya");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 21. Non-string input throws TypeError
// ────────────────────────────────────────────────────────────────────────────
describe("Non-string input", () => {
  it("throws TypeError for null", () => {
    assert.throws(() => parseCSV(null), TypeError);
  });

  it("throws TypeError for a number", () => {
    assert.throws(() => parseCSV(42), TypeError);
  });

  it("throws TypeError for an array", () => {
    assert.throws(() => parseCSV([]), TypeError);
  });
});
