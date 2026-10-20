import { describe, expect, test } from "bun:test";
import { setJsonPropertyFallback } from "../scripts/lib/jsonc.ts";

describe("dependency-free JSONC fallback", () => {
  test("creates missing parents, accepts trailing commas, and preserves comment-like string text", () => {
    const input = '{"text":"comma, } and // still text", "items":[1,], /* comment */}';
    const result = setJsonPropertyFallback(input, ["presets", "optimized", "orchestrator"], {
      model: "provider/model",
      variant: "high",
    });

    expect(result.commentsPreserved).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      text: "comma, } and // still text",
      items: [1],
      presets: { optimized: { orchestrator: { model: "provider/model", variant: "high" } } },
    });
  });

  test("rejects malformed comments and empty edit paths", () => {
    expect(() => setJsonPropertyFallback("{/* unterminated", ["presets"], {})).toThrow(/unterminated/);
    expect(() => setJsonPropertyFallback("{}", [], {})).toThrow(/empty path/);
  });

  test("rejects duplicate decoded keys and comments that would join JSON tokens", () => {
    expect(() => setJsonPropertyFallback('{"a":1,"\\u0061":2}', ["presets"], {})).toThrow(/duplicate key/);
    expect(() => setJsonPropertyFallback('{"value":1/* comment */2}', ["presets"], {})).toThrow();
  });
});
