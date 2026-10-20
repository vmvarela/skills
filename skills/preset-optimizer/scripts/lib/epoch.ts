// Epoch ECI fetch + strict normalization + 24h/ETag cache with last-good preservation.
// Quality source is ONLY the official Epoch ECI benchmark archive.

import { rename, writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { parseCsv, headerIndex, CsvError } from "./csv.ts";
import { extractAllowed, ZipError } from "./zip.ts";
import type { EpochData } from "./types.ts";

export const EPOCH_URL = "https://epoch.ai/data/benchmark_data.zip";
export const ECI_CSV = "epoch_capabilities_index/eci_scores.csv";
export const META_CSV = "model_metadata.csv";
export const SCHEMA_VERSION = "1";

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ECI_ROWS = 20_000;
const MAX_META_ROWS = 100_000;
const MAX_COLS = 40;

export class EpochError extends Error {}

export interface FetchOptions {
  cachePath: string;
  force?: boolean;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface RefreshResult {
  data: EpochData;
  status: "fresh" | "revalidated" | "updated" | "stale";
  warning?: string;
}

export interface CacheSnapshot {
  schemaVersion: string;
  etag: string | null;
  fetchedAt: string;
  checkedAt: string;
  data: EpochData;
}

/** Normalized identifier used for deterministic matching only (see match.ts). */
export function normId(s: string): string {
  // documented deterministic rule: lowercase, dot/space are interchangeable with dash;
  // no suffix stripping ever (-free/-contributor endpoints never match base models)
  return s.trim().toLowerCase().replace(/[.\s]+/g, "-");
}

/** Structural + temporal validation: only a fully compatible snapshot may be reused or 304-validated. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function isValidSnapshot(j: unknown, now: Date): j is CacheSnapshot {
  if (!j || typeof j !== "object") return false;
  const s = j as Record<string, unknown>;
  if (s.schemaVersion !== SCHEMA_VERSION) return false;
  if (s.etag !== null && typeof s.etag !== "string") return false;
  for (const t of [s.fetchedAt, s.checkedAt]) {
    if (typeof t !== "string" || Number.isNaN(new Date(t).getTime())) return false;
    if (new Date(t).getTime() > now.getTime() + FUTURE_SKEW_MS) return false; // future-dated: incompatible
  }
  const d = s.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object" || d.schemaVersion !== SCHEMA_VERSION) return false;
  for (const t of [d.fetchedAt, d.checkedAt]) {
    if (typeof t !== "string" || Number.isNaN(new Date(t).getTime())) return false;
    if (new Date(t).getTime() > now.getTime() + FUTURE_SKEW_MS) return false;
  }
  if (typeof d.etag !== "string" && d.etag !== null) return false;
  if (!d.eci || typeof d.eci !== "object" || Array.isArray(d.eci)) return false;
  if (!d.versionToGroup || typeof d.versionToGroup !== "object" || Array.isArray(d.versionToGroup)) return false;
  for (const v of Object.values(d.eci as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  for (const v of Object.values(d.versionToGroup as Record<string, unknown>)) {
    if (typeof v !== "string") return false;
  }
  // an empty payload can never back a fresh/304 cache
  if (Object.keys(d.eci).length === 0 || Object.keys(d.versionToGroup).length === 0) return false;
  // Unmapped version rows are VALID and preserved (real snapshots carry version
  // mappings to groups without an ECI; they are needed for diagnostics and are
  // safely ignored at match time). Requiring full resolution here would make
  // every real cache unreusable.
  // snapshot metadata must agree with the data it wraps
  if (d.etag !== s.etag || d.fetchedAt !== s.fetchedAt || d.checkedAt !== s.checkedAt) return false;
  return true;
}

/**
 * ENOENT/ENOTDIR -> null (no cache). Any other read error (permissions, I/O)
 * throws instead of silently degrading to "no cache".
 */
export async function readCache(cachePath: string, now: Date = new Date()): Promise<CacheSnapshot | null> {
  let raw: string;
  try {
    raw = await readFile(cachePath, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw new EpochError(`epoch: cannot read cache ${cachePath}: ${code ?? (e as Error).message}`);
  }
  try {
    const j = JSON.parse(raw);
    if (!isValidSnapshot(j, now)) return null; // structurally invalid or future-dated: treated as no cache
    return j as CacheSnapshot;
  } catch {
    return null; // unparseable JSON: treated as no cache (a full download replaces it)
  }
}

async function writeCacheAtomic(cachePath: string, snap: CacheSnapshot): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  const tmp = cachePath + ".tmp-" + Math.random().toString(36).slice(2);
  try {
    await writeFile(tmp, JSON.stringify(snap), { flag: "wx" });
    await rename(tmp, cachePath);
  } catch (e) {
    await unlink(tmp).catch(() => {}); // never leave temp litter behind
    throw new EpochError(`epoch: cache write failed: ${(e as Error).message}`);
  }
}

function parseEciCsv(text: string): Record<string, number> {
  const rows = parseCsv(text, { maxRows: MAX_ECI_ROWS, maxCols: MAX_COLS });
  const [modelIdx, scoreIdx] = headerIndex(rows[0], ["Model", "eci"]);
  const eci: Record<string, number> = {};
  for (const row of rows.slice(1)) {
    const name = row[modelIdx].trim();
    const raw = row[scoreIdx].trim();
    if (!name) continue;
    if (raw === "") continue; // unscored rows are skipped, not errors
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new EpochError(`epoch: non-numeric eci for ${name}`);
    const key = normId(name);
    if (key in eci && eci[key] !== v) throw new EpochError(`epoch: conflicting eci rows for ${name}`);
    eci[key] = v;
  }
  return eci;
}

function parseMetaCsv(text: string): Record<string, string> {
  const rows = parseCsv(text, { maxRows: MAX_META_ROWS, maxCols: MAX_COLS });
  const [vIdx, gIdx] = headerIndex(rows[0], ["model_version", "model_group"]);
  const map: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    const version = row[vIdx].trim();
    const group = row[gIdx].trim();
    if (!version || !group) continue;
    const key = normId(version);
    const val = normId(group);
    if (key in map && map[key] !== val) throw new EpochError(`epoch: ambiguous model_version ${version}`);
    map[key] = val;
  }
  return map;
}

function normalizePayload(eciText: string, metaText: string, etag: string | null, now: Date): CacheSnapshot {
  const eci = parseEciCsv(eciText);
  const versionToGroup = parseMetaCsv(metaText);
  const data: EpochData = {
    schemaVersion: SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    checkedAt: now.toISOString(),
    etag,
    eci,
    versionToGroup,
  };
  const snap: CacheSnapshot = { schemaVersion: SCHEMA_VERSION, etag, fetchedAt: data.fetchedAt, checkedAt: data.checkedAt, data };
  // same compatibility gate as readCache: an empty/incompatible payload is never saved
  if (!isValidSnapshot(snap, now)) throw new EpochError("epoch: incompatible payload (empty or malformed ECI/version data)");
  return snap;
}

/** Bounded streaming read: aborts (and cancels the stream) as soon as the cap is exceeded. */
async function readBounded(res: Response, cap: number): Promise<Uint8Array> {
  if (!res.body) throw new EpochError("epoch: empty response body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new EpochError(`epoch: download over compressed cap (${cap} bytes)`);
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Refresh cache per contract: fresh 24h reuse; one conditional GET when stale;
 * 304 only against a compatible validated cache; --force revalidates remotely and
 * may still receive 304; network/parse failures keep the last-good cache.
 */
export async function refreshCache(opts: FetchOptions): Promise<RefreshResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const ttl = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  const cached = await readCache(opts.cachePath, now());

  if (cached && !opts.force) {
    const age = now().getTime() - new Date(cached.checkedAt).getTime();
    if (age < ttl) return { data: cached.data, status: "fresh" };
  }

  const headers: Record<string, string> = {};
  // 304 is only allowed against a compatible, validated snapshot
  if (cached && cached.etag) headers["If-None-Match"] = cached.etag;

  let res: Response;
  try {
    res = await doFetch(EPOCH_URL, { headers });
  } catch (e) {
    if (cached) {
      return { data: cached.data, status: "stale", warning: `epoch: network failure, using stale cache (${(e as Error).message})` };
    }
    throw new EpochError(`epoch: network failure and no cache: ${(e as Error).message}`);
  }

  if (res.status === 304) {
    if (!cached) throw new EpochError("epoch: unexpected 304 without cache");
    // renew checkedAt only (top level and data stay consistent); fetchedAt untouched
    const checkedAt = now().toISOString();
    const snap: CacheSnapshot = { ...cached, checkedAt, data: { ...cached.data, checkedAt } };
    await writeCacheAtomic(opts.cachePath, snap);
    return { data: snap.data, status: "revalidated" };
  }

  if (!res.ok) {
    if (cached) {
      return { data: cached.data, status: "stale", warning: `epoch: HTTP ${res.status}, using stale cache` };
    }
    throw new EpochError(`epoch: HTTP ${res.status} and no cache`);
  }

  const etag = res.headers.get("etag");
  try {
    const buf = await readBounded(res, MAX_DOWNLOAD_BYTES); // aborts mid-stream past the cap
    const entries = extractAllowed(buf, {
      allow: [ECI_CSV, META_CSV],
      maxCompressedBytes: MAX_DOWNLOAD_BYTES,
      maxEntryCompressedBytes: MAX_ENTRY_BYTES,
      maxEntryBytes: MAX_ENTRY_BYTES,
    });
    const snap = normalizePayload(entries.get(ECI_CSV)!, entries.get(META_CSV)!, etag, now());
    await writeCacheAtomic(opts.cachePath, snap);
    return { data: snap.data, status: "updated" };
  } catch (e) {
    // invalid payload: keep last-good cache untouched
    if (cached) {
      return { data: cached.data, status: "stale", warning: `epoch: invalid download kept stale cache: ${(e as Error).message}` };
    }
    if (e instanceof ZipError || e instanceof CsvError) throw new EpochError(`epoch: invalid payload: ${(e as Error).message}`);
    throw e;
  }
}
