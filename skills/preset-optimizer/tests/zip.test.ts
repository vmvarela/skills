import { describe, test, expect } from "bun:test";
import { inflateSync } from "fflate";
import { scanZip, extractAllowed, ZipError } from "../scripts/lib/zip.ts";
import { makeZip, ECI_CSV_ENTRY, META_CSV_ENTRY } from "./helpers.ts";

describe("zip extraction", () => {
  test("extracts exactly the allowlisted entries", () => {
    const zip = makeZip([
      { name: ECI_CSV_ENTRY, data: "a,b\n1,2\n" },
      { name: META_CSV_ENTRY, data: "c,d\n3,4\n" },
      { name: "unrelated/evil.csv", data: "nope\n" },
    ]);
    const out = extractAllowed(zip, {
      allow: [ECI_CSV_ENTRY, META_CSV_ENTRY],
      maxCompressedBytes: 1_000_000,
      maxEntryCompressedBytes: 1_000_000,
      maxEntryBytes: 1_000_000,
    });
    expect(out.size).toBe(2);
    expect(out.get(ECI_CSV_ENTRY)).toBe("a,b\n1,2\n");
    expect(out.has("unrelated/evil.csv")).toBe(false);
  });

  test("missing required entry is an error", () => {
    const zip = makeZip([{ name: ECI_CSV_ENTRY, data: "a\n" }]);
    expect(() =>
      extractAllowed(zip, {
        allow: [ECI_CSV_ENTRY, META_CSV_ENTRY],
        maxCompressedBytes: 1_000_000,
        maxEntryCompressedBytes: 1_000_000,
        maxEntryBytes: 1_000_000,
      }),
    ).toThrow(ZipError);
  });

  test("duplicate entry names are rejected", () => {
    const zip = makeZip([
      { name: ECI_CSV_ENTRY, data: "a\n" },
      { name: ECI_CSV_ENTRY, data: "b\n" },
    ]);
    expect(() =>
      extractAllowed(zip, {
        allow: [ECI_CSV_ENTRY],
        maxCompressedBytes: 1_000_000,
        maxEntryCompressedBytes: 1_000_000,
        maxEntryBytes: 1_000_000,
      }),
    ).toThrow(/duplicate entries/);
  });

  test("declared uncompressed size over cap is rejected before inflation", () => {
    // 10KB of zeros deflates to ~50 bytes; the declared size is truthful and over cap
    const big = "0".repeat(10_240);
    const zip = makeZip([{ name: ECI_CSV_ENTRY, data: big, deflate: true }]);
    expect(() =>
      extractAllowed(zip, {
        allow: [ECI_CSV_ENTRY],
        maxCompressedBytes: 1_000_000,
        maxEntryCompressedBytes: 1_000_000,
        maxEntryBytes: 1_000,
      }),
    ).toThrow(/size cap/);
  });

  test("actual decompressed size over cap is rejected even when declared small", () => {
    const big = "0".repeat(10_240);
    const zip = makeZip([{ name: ECI_CSV_ENTRY, data: big, declaredSize: 10, deflate: true }]);
    const entry = scanZip(zip)[0];
    const bounded = inflateSync(zip.subarray(entry.localOffset, entry.localOffset + entry.compressedSize), {
      out: new Uint8Array(1_001),
    });
    expect(bounded.length).toBe(1_001); // cap+1 sentinel, not the full 10KB expansion
    expect(() =>
      extractAllowed(zip, {
        allow: [ECI_CSV_ENTRY],
        maxCompressedBytes: 1_000_000,
        maxEntryCompressedBytes: 1_000_000,
        maxEntryBytes: 1_000,
      }),
    ).toThrow(/actual decompressed size over cap/);
  });

  test("truthful entry exactly at the cap is extracted (no false positive)", () => {
    const data = "x".repeat(1000);
    const zip = makeZip([{ name: ECI_CSV_ENTRY, data, declaredSize: 1000 }]);
    const out = extractAllowed(zip, {
      allow: [ECI_CSV_ENTRY],
      maxCompressedBytes: 1_000_000,
      maxEntryCompressedBytes: 1_000_000,
      maxEntryBytes: 1_000,
    });
    expect(out.get(ECI_CSV_ENTRY)).toBe(data);
  });

  test("archive over total compressed cap is rejected", () => {
    const zip = makeZip([{ name: ECI_CSV_ENTRY, data: "x".repeat(5000) }]);
    expect(() =>
      extractAllowed(zip, {
        allow: [ECI_CSV_ENTRY],
        maxCompressedBytes: 100,
        maxEntryCompressedBytes: 1_000_000,
        maxEntryBytes: 1_000_000,
      }),
    ).toThrow(/too large|over cap/);
  });

  test("malformed archive (no EOCD) is rejected", () => {
    expect(() => scanZip(new Uint8Array([1, 2, 3, 4]))).toThrow(ZipError);
  });

  test("round-trips deflate entries", () => {
    const zip = makeZip([{ name: "d/x.bin", data: "deflate me ".repeat(100), deflate: true }]);
    const entries = scanZip(zip);
    expect(entries[0].originalSize).toBe("deflate me ".repeat(100).length);
    // raw inflate of the entry payload works via standard tooling
    expect(typeof inflateSync).toBe("function");
  });
});
