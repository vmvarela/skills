// JSONC handling: preferred path uses jsonc-parser (modify/applyEdits keeps comments);
// fallback is a strict hand-rolled parser that loses comments (explicit warning) but
// rejects malformed, duplicate-key, or ambiguous input instead of recovering.

export class JsoncError extends Error {}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface Parsed {
  value: Json;
  commentsPreserved: boolean;
}

let jsoncMod: typeof import("jsonc-parser") | null | undefined;

async function loadJsonc() {
  if (jsoncMod !== undefined) return jsoncMod;
  try {
    jsoncMod = (await import("jsonc-parser")) as typeof import("jsonc-parser");
  } catch {
    jsoncMod = null;
  }
  return jsoncMod;
}

/** Duplicate-key check on the raw text via jsonc-parser's AST visitor. */
function findDuplicateKeys(parser: typeof import("jsonc-parser"), text: string): string | null {
  let dup: string | null = null;
  // each object/array gets a unique id so sibling containers never collide
  const stack: number[] = [];
  let nextId = 0;
  const seen = new Set<string>();
  parser.visit(text, {
    onObjectProperty(property: string) {
      const parent = stack[stack.length - 1];
      const key = `${parent}\u0000${property}`;
      if (seen.has(key)) dup = property;
      seen.add(key);
    },
    onObjectBegin() {
      stack.push(++nextId);
    },
    onObjectEnd() {
      stack.pop();
    },
    onArrayBegin() {
      stack.push(++nextId);
    },
    onArrayEnd() {
      stack.pop();
    },
  });
  return dup;
}

/**
 * Strict parse. Throws on syntax errors and duplicate keys (fail closed).
 * Returns whether the comment-preserving parser was used.
 */
export async function parseStrict(text: string): Promise<Parsed> {
  const parser = await loadJsonc();
  if (parser) {
    const errors: unknown[] = [];
    const value = parser.parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0 || value === undefined) {
      throw new JsoncError("jsonc: parse error");
    }
    const dup = findDuplicateKeys(parser, text);
    if (dup !== null) throw new JsoncError(`jsonc: duplicate key "${dup}"`);
    return { value, commentsPreserved: true };
  }
  return { value: fallbackParse(text), commentsPreserved: false };
}

// ---- fallback: strict minimal JSONC without comments -----------------------

function fallbackParse(text: string): Json {
  if (/[^\x09\x0a\x0d\x20-\x7e\u0080-\uffff]/.test(text)) throw new JsoncError("jsonc: control character");
  const sanitized = stripTrailingCommas(stripComments(text));
  assertNoDuplicateKeys(sanitized);
  return JSON.parse(sanitized) as Json;
}

/** State-machine comment stripper; also rejects duplicate keys via a reviver wrapper. */
function stripComments(text: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      out += " ";
      while (i + 1 < text.length && text[i + 1] !== "\n" && text[i + 1] !== "\r") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new JsoncError("jsonc: unterminated block comment");
      out += " ";
      i = end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Detect duplicate decoded object keys before JSON.parse overwrites them. */
function assertNoDuplicateKeys(text: string): void {
  let i = 0;
  const ws = () => { while (/[\x09\x0a\x0d\x20]/.test(text[i] ?? "")) i++; };
  const string = (): string => {
    const start = i;
    if (text[i++] !== '"') throw new JsoncError("jsonc: expected object key");
    let escaped = false;
    while (i < text.length) {
      const c = text[i++];
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') {
        try { return JSON.parse(text.slice(start, i)) as string; }
        catch { throw new JsoncError("jsonc: invalid string"); }
      }
    }
    throw new JsoncError("jsonc: unterminated string");
  };
  const value = (): void => {
    ws();
    if (text[i] === "{") {
      i++;
      ws();
      const keys = new Set<string>();
      if (text[i] === "}") { i++; return; }
      for (;;) {
        ws();
        const key = string();
        if (keys.has(key)) throw new JsoncError(`jsonc: duplicate key "${key}"`);
        keys.add(key);
        ws();
        if (text[i++] !== ":") throw new JsoncError("jsonc: expected colon");
        value();
        ws();
        if (text[i] === "}") { i++; return; }
        if (text[i++] !== ",") throw new JsoncError("jsonc: expected comma");
      }
    }
    if (text[i] === "[") {
      i++;
      ws();
      if (text[i] === "]") { i++; return; }
      for (;;) {
        value();
        ws();
        if (text[i] === "]") { i++; return; }
        if (text[i++] !== ",") throw new JsoncError("jsonc: expected comma");
      }
    }
    if (text[i] === '"') { string(); return; }
    const start = i;
    while (i < text.length && !/[\x09\x0a\x0d\x20,\]}]/.test(text[i])) i++;
    if (start === i) throw new JsoncError("jsonc: expected value");
  };
  value();
  ws();
  if (i !== text.length) throw new JsoncError("jsonc: trailing content");
}

/** Remove JSONC trailing commas without changing commas inside quoted strings. */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let next = i + 1;
      while (/[\x09\x0a\x0d\x20]/.test(text[next] ?? "")) next++;
      if (text[next] === "}" || text[next] === "]") {
        // trailing comma: legal in JSONC only after a real value; a comma-only
        // expression (`[ , ]`, `{ , }`) is malformed and must not be repaired
        let prev = i - 1;
        while (/[\x09\x0a\x0d\x20]/.test(text[prev] ?? "")) prev--;
        if (text[prev] === "{" || text[prev] === "[" || text[prev] === ",") {
          throw new JsoncError("jsonc: comma-only expression");
        }
        continue;
      }
    }
    out += c;
  }
  return out;
}

/**
 * Set a nested property (path of keys) on parsed JSONC text, preserving comments
 * when jsonc-parser is available. Returns the new text and whether comments were
 * preserved. Throws JsoncError on parse failures (before any write).
 */
export async function setJsonProperty(
  text: string,
  path: string[],
  value: Json,
): Promise<{ text: string; commentsPreserved: boolean }> {
  const parser = await loadJsonc();
  if (parser) {
    // validate first (fail closed before edits)
    await parseStrict(text);
    const edits = parser.modify(text, path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    const result = parser.applyEdits(text, edits);
    return { text: result, commentsPreserved: true };
  }
  return setJsonPropertyFallback(text, path, value);
}

/** Dependency-free fallback, exported for direct tests of the optional path. */
export function setJsonPropertyFallback(
  text: string,
  path: string[],
  value: Json,
): { text: string; commentsPreserved: false } {
  if (path.length === 0) throw new JsoncError("jsonc: cannot set empty path");
  const parsed = fallbackParse(text);
  let node: Json = parsed;
  for (const key of path.slice(0, -1)) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new JsoncError("jsonc: cannot set property");
    const object = node as Record<string, Json>;
    if (object[key] === undefined) object[key] = {};
    node = object[key];
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new JsoncError("jsonc: cannot set property");
  (node as Record<string, Json>)[path[path.length - 1]] = value;
  // comments are lost in the fallback path; caller must warn and back up
  return { text: JSON.stringify(parsed, null, 2) + "\n", commentsPreserved: false };
}
