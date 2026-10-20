// Size-bounded, allowlisted ZIP extraction.
// Scans the central directory first (no decompression) to enforce:
//   - total compressed bytes cap, per-entry declared compressed/uncompressed caps
//   - duplicate entry-name rejection, exact entry allowlist
// Inflation uses fflate's verified bounded-buffer API: `inflateSync(payload, { out })`
// writes into a fixed `maxEntryBytes + 1` buffer (verified empirically: the
// returned Uint8Array length reflects bytes written, oversized output truncates
// to fit, no padding), so inflated memory is bounded and an output of cap+1
// detects overflow. Stored (0) and deflate (8) methods are allowed; the
// declared-vs-actual size check still applies after inflation.
// Residual limitation: the {out} buffer bounds ALLOCATION but cannot abort CPU
// work at the cap; the compressed-input caps already bound that work.

import { inflateSync } from "fflate";

export class ZipError extends Error {}

export interface ZipCaps {
  maxCompressedBytes: number;
  maxEntryCompressedBytes: number;
  maxEntryBytes: number;
}

export interface CentralEntry {
  name: string;
  compressedSize: number;
  originalSize: number;
  method: number;
  localOffset: number;
}

/** Minimal central-directory scan (no inflation). Throws on malformed archives. */
export function scanZip(data: Uint8Array): CentralEntry[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // locate End Of Central Directory record
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65_536); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("zip: end of central directory not found");
  const count = dv.getUint16(eocd + 10, true);
  let offset = dv.getUint32(eocd + 16, true);
  const entries: CentralEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (offset + 46 > data.length || dv.getUint32(offset, true) !== 0x02014b50) {
      throw new ZipError("zip: malformed central directory");
    }
    const method = dv.getUint16(offset + 10, true);
    const compressedSize = dv.getUint32(offset + 20, true);
    const originalSize = dv.getUint32(offset + 24, true);
    const nameLen = dv.getUint16(offset + 28, true);
    const extraLen = dv.getUint16(offset + 30, true);
    const commentLen = dv.getUint16(offset + 32, true);
    const localOffset = dv.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLen));
    if (method !== 0 && method !== 8) throw new ZipError(`zip: unsupported method ${method} for ${name}`);
    if (localOffset + 30 > data.length || dv.getUint32(localOffset, true) !== 0x04034b50) {
      throw new ZipError(`zip: malformed local header for ${name}`);
    }
    const localNameLen = dv.getUint16(localOffset + 26, true);
    const localExtraLen = dv.getUint16(localOffset + 28, true);
    entries.push({ name, compressedSize, originalSize, method, localOffset: localOffset + 30 + localNameLen + localExtraLen });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export interface ZipLimits extends ZipCaps {
  /** exact entry names allowed; anything else is ignored but duplicates rejected */
  allow: string[];
}

/** Extract only allowlisted entries, enforcing all caps. Returns name -> text. */
export function extractAllowed(data: Uint8Array, limits: ZipLimits): Map<string, string> {
  if (data.length > limits.maxCompressedBytes) {
    throw new ZipError(`zip: archive too large (${data.length} > ${limits.maxCompressedBytes})`);
  }
  const entries = scanZip(data);
  const totalCompressed = entries.reduce((s, e) => s + e.compressedSize, 0);
  if (totalCompressed > limits.maxCompressedBytes) {
    throw new ZipError(`zip: total compressed bytes ${totalCompressed} over cap`);
  }
  const seen = new Map<string, number>();
  for (const e of entries) seen.set(e.name, (seen.get(e.name) ?? 0) + 1);
  for (const e of entries) {
    if (e.originalSize > limits.maxEntryBytes || e.compressedSize > limits.maxEntryCompressedBytes) {
      throw new ZipError(`zip: entry over size cap: ${e.name}`);
    }
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length) throw new ZipError(`zip: duplicate entries: ${dupes.map(([n]) => n).join(", ")}`);

  const wanted = new Set(limits.allow);
  const missing = limits.allow.filter((a) => !entries.some((e) => e.name === a));
  if (missing.length) throw new ZipError(`zip: missing required entries: ${missing.join(", ")}`);

  const out = new Map<string, string>();
  for (const e of entries) {
    if (!wanted.has(e.name)) continue;
    const payload = data.subarray(e.localOffset, e.localOffset + e.compressedSize);
    const raw = e.method === 0
      ? payload
      : inflateSync(payload, { out: new Uint8Array(limits.maxEntryBytes + 1) });
    if (raw.length > limits.maxEntryBytes) throw new ZipError(`zip: actual decompressed size over cap: ${e.name}`);
    if (raw.length !== e.originalSize) throw new ZipError(`zip: declared size mismatch for ${e.name} (lying archive)`);
    out.set(e.name, new TextDecoder().decode(raw));
  }
  return out;
}
