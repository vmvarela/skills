import { describe, test, expect } from "bun:test";
import { parseCsv, headerIndex, CsvError } from "../scripts/lib/csv.ts";

describe("strict csv", () => {
  test("parses quoted fields, embedded commas and newlines", () => {
    const rows = parseCsv('a,b\n"x, y","line1\nline2"\n', { maxRows: 10, maxCols: 10 });
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", "line1\nline2"],
    ]);
  });

  test("doubled quotes escape", () => {
    const rows = parseCsv('"say ""hi""",b\n', { maxRows: 10, maxCols: 10 });
    expect(rows[0][0]).toBe('say "hi"');
  });

  test("trailing newline does not add a row", () => {
    const rows = parseCsv("a,b\n1,2\n", { maxRows: 10, maxCols: 10 });
    expect(rows.length).toBe(2);
  });

  test("rejects ragged rows", () => {
    expect(() => parseCsv("a,b\n1\n", { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("rejects unterminated quote", () => {
    expect(() => parseCsv('a,b\n"open\n', { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("rejects quote inside unquoted field", () => {
    expect(() => parseCsv('a"b,c\n', { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("rejects NUL bytes", () => {
    expect(() => parseCsv("a\0b\n", { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("enforces row limit", () => {
    expect(() => parseCsv("a\n1\n2\n3\n", { maxRows: 2, maxCols: 5 })).toThrow(CsvError);
  });

  test("enforces column limit", () => {
    expect(() => parseCsv("a,b,c,d\n", { maxRows: 10, maxCols: 3 })).toThrow(CsvError);
  });

  test("rejects empty input", () => {
    expect(() => parseCsv("\n\n", { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("rejects bare CR (CR not followed by LF)", () => {
    // regression: a bare CR used to be dropped silently, merging "1\r2" into "12"
    expect(() => parseCsv("x,1\r2\n", { maxRows: 10, maxCols: 10 })).toThrow(/bare CR/);
    expect(() => parseCsv("a,b\n1\r", { maxRows: 10, maxCols: 10 })).toThrow(/bare CR/);
    expect(() => parseCsv('"a"\rX,1\n', { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
  });

  test("parses CRLF line endings without dropping data", () => {
    expect(parseCsv("a,b\r\n1,2\r\n", { maxRows: 10, maxCols: 10 })).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv('"x","1"\r\n', { maxRows: 10, maxCols: 10 })).toEqual([["x", "1"]]);
  });

  test("headerIndex throws on missing column", () => {
    expect(() => headerIndex(["Model", "eci"], ["Model", "score"])).toThrow(CsvError);
  });

  test("rejects any non-delimiter/non-newline after a closing quote", () => {
    expect(() => parseCsv('"Alpha"X,123\n', { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
    expect(() => parseCsv('"a" "b",c\n', { maxRows: 10, maxCols: 10 })).toThrow(CsvError);
    // delimiter, CRLF, and EOF after a closing quote remain valid
    expect(parseCsv('"a","b"\n', { maxRows: 10, maxCols: 10 })).toEqual([["a", "b"]]);
    expect(parseCsv('"a"\r\n', { maxRows: 10, maxCols: 10 })).toEqual([["a"]]);
    expect(parseCsv('"a"', { maxRows: 10, maxCols: 10 })).toEqual([["a"]]);
  });
});
