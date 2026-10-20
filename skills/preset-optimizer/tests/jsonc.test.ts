import { describe, test, expect } from "bun:test";
import { parseStrict, setJsonPropertyFallback, JsoncError } from "../scripts/lib/jsonc.ts";

describe("jsonc strictness", () => {
  test("duplicate keys are rejected, including empty-string keys", async () => {
    expect(parseStrict('{"a":1,"a":2}')).rejects.toThrow(/duplicate key "a"/);
    expect(parseStrict('{"":1,"":2}')).rejects.toThrow(/duplicate key ""/);
    expect(parseStrict('{"a":{"x":1},"b":{"x":2}}')).resolves.toBeTruthy(); // siblings fine
  });

  test("trailing commas are valid JSONC", async () => {
    const p = await parseStrict('{"a":1,"b":[1,2,],}');
    expect(p.value).toEqual({ a: 1, b: [1, 2] });
    expect(p.commentsPreserved).toBe(true);
  });

  test("comments are preserved through the main parser", async () => {
    const p = await parseStrict('{\n  // hi\n  "a": 1,\n}');
    expect((p.value as Record<string, unknown>).a).toBe(1);
    expect(p.commentsPreserved).toBe(true);
  });
});

describe("fallback parser (no jsonc-parser)", () => {
  test("rejects comma-only arrays and objects instead of repairing them", () => {
    expect(() => setJsonPropertyFallback("[ , ]", ["a"], 1)).toThrow(/comma-only/);
    expect(() => setJsonPropertyFallback("{ , }", ["a"], 1)).toThrow(/comma-only/);
    expect(() => setJsonPropertyFallback('{"a":1,,}', ["b"], 1)).toThrow();
    expect(() => setJsonPropertyFallback("[1,,2]", ["a"], 1)).toThrow();
  });

  test("accepts trailing commas after real values", () => {
    const r = setJsonPropertyFallback('{"a":[1,2,],}', ["b"], 1);
    expect(JSON.parse(r.text)).toEqual({ a: [1, 2], b: 1 });
    expect(r.commentsPreserved).toBe(false); // documented comment loss
  });

  test("rejects malformed input fail-closed", () => {
    expect(() => setJsonPropertyFallback("{ presets: ,", ["a"], 1)).toThrow();
    expect(() => setJsonPropertyFallback('{"a":1,"a":2}', ["b"], 1)).toThrow(/duplicate key/);
    expect(() => setJsonPropertyFallback('{"a":1} trailing', ["b"], 1)).toThrow();
  });
});
