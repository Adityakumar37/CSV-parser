import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, CsvParseError } from "../src/index.js";

const plain = (rows) => rows.map((r) => ({ ...r }));
describe("Option: delimiter", () => {
  it("defaults to comma", () => {
    const csv = "a,b\n1,2";
    assert.deepStrictEqual(plain(parseCSV(csv)), [{ a: "1", b: "2" }]);
  });

  it("supports custom delimiter such as semicolon", () => {
    const csv = "name;age;city\nAditya;18;Pune";
    const result = parseCSV(csv, { delimiter: ";" });
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18", city: "Pune" },
    ]);
  });

  it("supports tab delimiter (TSV)", () => {
    const csv = "col1\tcol2\nval1\tval2";
    const result = parseCSV(csv, { delimiter: "\t" });
    assert.deepStrictEqual(plain(result), [{ col1: "val1", col2: "val2" }]);
  });

  it("supports pipe delimiter", () => {
    const csv = "col1|col2\nval1|val2";
    const result = parseCSV(csv, { delimiter: "|" });
    assert.deepStrictEqual(plain(result), [{ col1: "val1", col2: "val2" }]);
  });
  it("parses semicolon delimiter with quoted semicolons", () => {
    const csv = 'name;bio;city\nAditya;"Developer; Loves coding; JS";Pune';
    const result = parseCSV(csv, { delimiter: ";" });
    assert.deepStrictEqual(plain(result), [
      {
        name: "Aditya",
        bio: "Developer; Loves coding; JS",
        city: "Pune",
      },
    ]);
  });
});
describe("Option: quote", () => {
  it("supports custom single quote character", () => {
    const csv = "name,title\nAditya,'Software Engineer, Lead'";
    const result = parseCSV(csv, { quote: "'" });
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", title: "Software Engineer, Lead" },
    ]);
  });

  it("handles escaped quotes with custom quote character", () => {
    const csv = "id,text\n1,'it''s a great day'";
    const result = parseCSV(csv, { quote: "'" });
    assert.deepStrictEqual(plain(result), [
      { id: "1", text: "it's a great day" },
    ]);
  });

  it("throws CsvParseError on unterminated custom quote", () => {
    const csv = "id,text\n1,'unterminated";
    assert.throws(
      () => parseCSV(csv, { quote: "'" }),
      (err) => err instanceof CsvParseError && err.row === 2
    );
  });
});
describe("Option: trim", () => {
  it("defaults to false (preserves whitespace)", () => {
    const csv = " name , age \n  Aditya  ,  18  ";
    const result = parseCSV(csv);
    assert.deepStrictEqual(plain(result), [
      { " name ": "  Aditya  ", " age ": "  18  " },
    ]);
  });

  it("trims whitespace on unquoted fields and header names", () => {
    const csv = "  name  ,  age  \n  Aditya  ,  18  ";
    const result = parseCSV(csv, { trim: true });
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18" },
    ]);
  });
  it("trims unquoted fields and headers while keeping quoted content exactly as written", () => {
    const csv = '  name  ,  age  ,  note  \n  Aditya  ,"  18  ",  " unquoted lookalike " ';
    const csv2 = '  name  ,  age  ,  bio  \n  Aditya  ,"  18  ","  coder  "';
    const result = parseCSV(csv2, { trim: true });
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "  18  ", bio: "  coder  " },
    ]);
  });

  it("trims custom headers array when trim is true", () => {
    const csv = "  Aditya  ,  18  ";
    const result = parseCSV(csv, {
      headers: ["  first name  ", "  user age  "],
      trim: true,
    });
    assert.deepStrictEqual(plain(result), [
      { "first name": "Aditya", "user age": "18" },
    ]);
  });
});
describe("Option: headers", () => {
  it("defaults to true", () => {
    const csv = "a,b\n1,2";
    assert.deepStrictEqual(plain(parseCSV(csv)), [{ a: "1", b: "2" }]);
  });
  it("returns an array of arrays of strings when headers is false", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const result = parseCSV(csv, { headers: false });
    assert.deepStrictEqual(result, [
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("returns [] for empty string when headers is false", () => {
    const result = parseCSV("", { headers: false });
    assert.deepStrictEqual(result, []);
  });

  it("throws CsvParseError for column count mismatch when headers is false", () => {
    const csv = "a,b\n1,2,3";
    assert.throws(
      () => parseCSV(csv, { headers: false }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 2 &&
        /Row 2 has 3 fields but expected 2/.test(err.message)
    );
  });

  it("uses custom headers array and treats the first row as data", () => {
    const csv = "Aditya,18\nRahul,20";
    const result = parseCSV(csv, { headers: ["name", "age"] });
    assert.deepStrictEqual(plain(result), [
      { name: "Aditya", age: "18" },
      { name: "Rahul", age: "20" },
    ]);
  });
  it("throws CsvParseError when custom headers count mismatches first row", () => {
    const csv = "Aditya,18,extra\nRahul,20,extra";
    assert.throws(
      () => parseCSV(csv, { headers: ["name", "age"] }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 1 &&
        /Row 1 has 3 fields but expected 2/.test(err.message)
    );
  });

  it("throws CsvParseError when custom headers count mismatches subsequent row", () => {
    const csv = "Aditya,18\nRahul,20,extra";
    assert.throws(
      () => parseCSV(csv, { headers: ["name", "age"] }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 2 &&
        /Row 2 has 3 fields but expected 2/.test(err.message)
    );
  });
});
describe("Option: skipEmptyLines", () => {
  it("defaults to true", () => {
    const csv = "a,b\n\n1,2\n\n3,4\n";
    const result = parseCSV(csv);
    assert.equal(result.length, 2);
    assert.deepStrictEqual(plain(result), [
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("preserves empty lines when skipEmptyLines is false with headers: false", () => {
    const csv = "a\n\nb";
    const result = parseCSV(csv, { headers: false, skipEmptyLines: false });
    assert.deepStrictEqual(result, [["a"], [""], ["b"]]);
  });

  it("throws CsvParseError on empty line when skipEmptyLines is false with headers: true", () => {
    const csv = "a,b\n\n1,2";
    assert.throws(
      () => parseCSV(csv, { skipEmptyLines: false }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 2 &&
        /Row 2 has 1 fields but expected 2/.test(err.message)
    );
  });
});
describe("Option: maxRows", () => {
  it("defaults to Infinity (allows all rows)", () => {
    const csv = "a\n1\n2\n3\n4\n5";
    const result = parseCSV(csv);
    assert.equal(result.length, 5);
  });

  it("allows rows within maxRows limit", () => {
    const csv = "name,age\nAditya,18\nRahul,20";
    const result = parseCSV(csv, { maxRows: 2 });
    assert.equal(result.length, 2);
  });
  it("throws CsvParseError when data rows exceed maxRows", () => {
    const csv = "name,age\nAditya,18\nRahul,20\nAman,19";
    assert.throws(
      () => parseCSV(csv, { maxRows: 2 }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 4 &&
        /limit of 2 exceeded/.test(err.message)
    );
  });

  it("throws CsvParseError when maxRows: 0 and data rows exist", () => {
    const csv = "name,age\nAditya,18";
    assert.throws(
      () => parseCSV(csv, { maxRows: 0 }),
      (err) => err instanceof CsvParseError && err.row === 2
    );
  });

  it("returns [] when maxRows: 0 and only header exists", () => {
    const csv = "name,age";
    const result = parseCSV(csv, { maxRows: 0 });
    assert.deepStrictEqual(result, []);
  });

  it("throws CsvParseError when maxRows exceeded with headers: false", () => {
    const csv = "1,2\n3,4\n5,6";
    assert.throws(
      () => parseCSV(csv, { headers: false, maxRows: 2 }),
      (err) => err instanceof CsvParseError && err.row === 3
    );
  });

  it("throws CsvParseError when maxRows exceeded with custom headers", () => {
    const csv = "1,2\n3,4\n5,6";
    assert.throws(
      () => parseCSV(csv, { headers: ["a", "b"], maxRows: 2 }),
      (err) => err instanceof CsvParseError && err.row === 3
    );
  });
});
describe("Validation: Unknown option keys", () => {
  it("throws TypeError on 'delimeter' typo", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimeter: ";" }),
      (err) => err instanceof TypeError && /delimeter/.test(err.message)
    );
  });

  it("throws TypeError on other unknown option keys", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { unknownOpt: true }),
      (err) => err instanceof TypeError && /unknownOpt/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { header: true }),
      (err) => err instanceof TypeError && /header/.test(err.message)
    );
  });
});
describe("Validation: Invalid option values", () => {
  it("throws TypeError when options is not a plain object", () => {
    assert.throws(() => parseCSV("a,b\n1,2", null), TypeError);
    assert.throws(() => parseCSV("a,b\n1,2", []), TypeError);
    assert.throws(() => parseCSV("a,b\n1,2", "options"), TypeError);
    assert.throws(() => parseCSV("a,b\n1,2", 123), TypeError);
  });

  it("throws TypeError for invalid delimiter values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: "" }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: ",," }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: 123 }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: '"' }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: "\r" }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { delimiter: "\n" }),
      (err) => err instanceof TypeError && /delimiter/.test(err.message)
    );
  });

  it("throws TypeError for invalid quote values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: "" }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: "''" }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: 123 }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: "\n" }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: "\r" }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { quote: "," }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a;b\n1;2", { delimiter: ";", quote: ";" }),
      (err) => err instanceof TypeError && /quote/.test(err.message)
    );
  });

  it("throws TypeError for invalid trim values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { trim: "true" }),
      (err) => err instanceof TypeError && /trim/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { trim: 1 }),
      (err) => err instanceof TypeError && /trim/.test(err.message)
    );
  });

  it("throws TypeError for invalid headers values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { headers: "names" }),
      (err) => err instanceof TypeError && /headers/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { headers: 123 }),
      (err) => err instanceof TypeError && /headers/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { headers: [] }),
      (err) => err instanceof TypeError && /headers/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { headers: [1, 2] }),
      (err) => err instanceof TypeError && /headers/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { headers: ["a", "a"] }),
      (err) => err instanceof TypeError && /headers/.test(err.message)
    );
  });

  it("throws TypeError for invalid skipEmptyLines values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { skipEmptyLines: "true" }),
      (err) => err instanceof TypeError && /skipEmptyLines/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { skipEmptyLines: 0 }),
      (err) => err instanceof TypeError && /skipEmptyLines/.test(err.message)
    );
  });

  it("throws TypeError for invalid maxRows values", () => {
    assert.throws(
      () => parseCSV("a,b\n1,2", { maxRows: -1 }),
      (err) => err instanceof TypeError && /maxRows/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { maxRows: "5" }),
      (err) => err instanceof TypeError && /maxRows/.test(err.message)
    );
    assert.throws(
      () => parseCSV("a,b\n1,2", { maxRows: NaN }),
      (err) => err instanceof TypeError && /maxRows/.test(err.message)
    );
  });
});
describe("Edge cases & Regression tests", () => {
  it("quoted empty value in single-column file is kept", () => {
    const out = parseCSV('name\n""\nAditya');
    assert.deepStrictEqual(
      out.map((r) => ({ ...r })),
      [{ name: "" }, { name: "Aditya" }]
    );
  });

  it("blank line vs quoted empty with skipEmptyLines false", () => {
    assert.throws(
      () => parseCSV("a,b\n\n1,2", { skipEmptyLines: false }),
      CsvParseError
    );
  });

  it("TSV of only tabs is not treated as empty", () => {
    const out = parseCSV("a\tb\tc\n\t\t", { delimiter: "\t" });
    assert.strictEqual(out.length, 1);
  });

  it("lone \\r followed by content", () => {
    assert.strictEqual(parseCSV("a,b\r1,2\r3,4").length, 2);
  });

  it("quoted field ending at EOF with no newline", () => {
    assert.strictEqual(parseCSV('a\n"x"').length, 1);
  });

  it("whitespace-only line with trim: true is skipped as blank", () => {
    const csv = "name,age\n   \nAditya,18";
    const out = parseCSV(csv, { trim: true });
    assert.deepStrictEqual(
      out.map((r) => ({ ...r })),
      [{ name: "Aditya", age: "18" }]
    );
  });

  it("whitespace-only line with trim: false throws column mismatch in multi-column CSV", () => {
    const csv = "name,age\n   \nAditya,18";
    assert.throws(
      () => parseCSV(csv, { trim: false }),
      (err) =>
        err instanceof CsvParseError &&
        err.row === 2 &&
        /Row 2 has 1 fields but expected 2/.test(err.message)
    );
  });

  it("allows spaces after closing quote when trim: true", () => {
    const csv = 'name,city\n"Aditya" ,Pune\n"Rahul" \t,Delhi';
    const out = parseCSV(csv, { trim: true });
    assert.deepStrictEqual(
      out.map((r) => ({ ...r })),
      [
        { name: "Aditya", city: "Pune" },
        { name: "Rahul", city: "Delhi" },
      ]
    );
  });

  it("throws for spaces after closing quote when trim: false", () => {
    const csv = 'name,city\n"Aditya" ,Pune';
    assert.throws(
      () => parseCSV(csv, { trim: false }),
      (err) => err instanceof CsvParseError && err.row === 2
    );
  });
});
