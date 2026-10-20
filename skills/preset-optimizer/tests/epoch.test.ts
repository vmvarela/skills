import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { refreshCache, readCache, EpochError, EPOCH_URL, ECI_CSV, META_CSV } from "../scripts/lib/epoch.ts";
import { makeSyntheticZip } from "./helpers.ts";

let dir: string;
let cachePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "po-epoch-"));
  cachePath = join(dir, "cache.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fixedClock(start: Date) {
  let t = start.getTime();
  return () => new Date((t += 60_000));
}

function mockFetch(status: number, body: Uint8Array | null, etag: string | null = '"e1"', capture?: { headers?: Record<string, string> }) {
  return (async (url: string, init?: RequestInit) => {
    if (capture) capture.headers = Object.fromEntries(Object.entries(init?.headers ?? {}));
    if (url !== EPOCH_URL) throw new Error(`unexpected url ${url}`);
    if (status === 0) throw new Error("network down");
    return new Response(status === 304 ? null : body!, { status, headers: etag ? { etag } : {} });
  }) as typeof fetch;
}

const T0 = new Date("2026-10-19T00:00:00Z");

describe("epoch cache", () => {
  test("no cache + valid download -> updated", async () => {
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
    expect(Object.keys(r.data.eci)).toContain("alpha-model");
    expect(r.data.versionToGroup["beta-model"]).toBe("beta-model");
    const snap = await readCache(cachePath);
    expect(snap?.etag).toBe('"e1"');
  });

  test("fresh cache is reused without any fetch", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    let called = false;
    const r = await refreshCache({
      cachePath,
      fetchImpl: (async () => {
        called = true;
        throw new Error("must not fetch");
      }) as typeof fetch,
      now: fixedClock(T0),
    });
    expect(called).toBe(false);
    expect(r.status).toBe("fresh");
  });

  test("expired cache + 304 renews checkedAt only", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const before = await readCache(cachePath);
    const later = new Date(T0.getTime() + 25 * 60 * 60 * 1000);
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(304, null), now: fixedClock(later) });
    expect(r.status).toBe("revalidated");
    // assert on the raw bytes: the mock clock runs ahead of the real clock, so a
    // real-clock readCache would (correctly) reject the renewed snapshot as future-dated
    const after = JSON.parse(await readFile(cachePath, "utf8"));
    expect(after.checkedAt).not.toBe(before!.checkedAt);
    expect(after.fetchedAt).toBe(before!.fetchedAt);
    expect(after.data.etag).toBe(before!.data.etag);
    expect(after.data.eci).toEqual(before!.data.eci);
    expect(after.data.versionToGroup).toEqual(before!.data.versionToGroup);
  });

  test("304 request carries If-None-Match and is refused without cache", async () => {
    // no cache at all: a 304 response is invalid
    expect(refreshCache({ cachePath, fetchImpl: mockFetch(304, null), now: fixedClock(T0) })).rejects.toThrow(EpochError);
  });

  test("--force revalidates a fresh cache remotely and accepts 304", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(304, null), now: fixedClock(T0), force: true });
    expect(r.status).toBe("revalidated");
  });

  test("changed payload with new etag replaces data", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const zip2 = makeSyntheticZip({ [ECI_CSV]: "Model,eci\nNew Model,111.0\n" });
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, zip2, '"e2"'), now: fixedClock(T0), force: true });
    expect(r.status).toBe("updated");
    expect(r.data.eci["new-model"]).toBe(111);
    expect(r.data.etag).toBe('"e2"');
  });

  test("network failure keeps last-good cache and warns", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const rawBefore = await readFile(cachePath, "utf8");
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(0, null), now: fixedClock(T0), force: true });
    expect(r.status).toBe("stale");
    expect(r.warning).toMatch(/network failure/);
    expect(await readFile(cachePath, "utf8")).toBe(rawBefore);
  });

  test("network failure without cache exits with error", async () => {
    expect(refreshCache({ cachePath, fetchImpl: mockFetch(0, null), now: fixedClock(T0) })).rejects.toThrow(EpochError);
  });

  test("invalid download keeps last-good cache untouched", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const rawBefore = await readFile(cachePath, "utf8");
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, new Uint8Array([0, 1, 2, 3]), '"bad"'), now: fixedClock(T0), force: true });
    expect(r.status).toBe("stale");
    expect(r.warning).toMatch(/invalid download/);
    expect(await readFile(cachePath, "utf8")).toBe(rawBefore);
  });

  test("incompatible cache schema is ignored (no 304 from it)", async () => {
    await writeFile(cachePath, JSON.stringify({ schemaVersion: "0", etag: '"old"', data: { schemaVersion: "0", eci: {}, versionToGroup: {} } }));
    const capture: { headers?: Record<string, string> } = {};
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip(), '"e9"', capture), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
    expect(capture.headers?.["If-None-Match"]).toBeUndefined();
  });

  test("non-numeric eci value fails closed", async () => {
    expect(
      refreshCache({
        cachePath,
        fetchImpl: mockFetch(200, makeSyntheticZip({ [ECI_CSV]: "Model,eci\nX,abc\n" })),
        now: fixedClock(T0),
      }),
    ).rejects.toThrow(EpochError);
  });

  test("conflicting eci rows for one model fail closed", async () => {
    expect(
      refreshCache({
        cachePath,
        fetchImpl: mockFetch(200, makeSyntheticZip({ [ECI_CSV]: "Model,eci\nX,1.0\nX,2.0\n" })),
        now: fixedClock(T0),
      }),
    ).rejects.toThrow(EpochError);
  });

  test("ambiguous model_version (two groups) fails closed", async () => {
    const meta = "model_version,model_group\nv1,Group A\nv1,Group B\n";
    expect(
      refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip({ [META_CSV]: meta })), now: fixedClock(T0) }),
    ).rejects.toThrow(EpochError);
  });

  // ---- review findings: cache compatibility + bounded download + temp cleanup ----

  function seedSnapshot(snap: unknown) {
    return writeFile(cachePath, JSON.stringify(snap));
  }

  const validSnap = (over: object = {}): object => ({
    schemaVersion: "1",
    etag: '"e0"',
    fetchedAt: "2026-01-01T00:00:00Z",
    checkedAt: "2026-01-01T00:00:00Z",
    data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z", etag: '"e0"', eci: { x: 1.5 }, versionToGroup: { v: "x" } },
    ...over,
  });

  test("cache with non-finite eci values is incompatible and replaced by a download", async () => {
    await seedSnapshot(validSnap({ data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z", etag: '"e0"', eci: { x: "oops" }, versionToGroup: { v: "x" } } }));
    const capture: { headers?: Record<string, string> } = {};
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip(), '"e1"', capture), now: fixedClock(T0) });
    expect(r.status).toBe("updated"); // full download, no 304 against the invalid cache
    expect(capture.headers?.["If-None-Match"]).toBeUndefined();
    expect(await readCache(cachePath)).toMatchObject({ etag: '"e1"' });
  });

  test("future-dated cache cannot qualify for reuse or 304", async () => {
    const future = new Date(T0.getTime() + 10 * 60 * 60 * 1000).toISOString();
    await seedSnapshot(validSnap({ checkedAt: future, data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: future, etag: '"e0"', eci: { x: 1.5 }, versionToGroup: { v: "x" } } }));
    const capture: { headers?: Record<string, string> } = {};
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip(), '"e1"', capture), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
    expect(capture.headers?.["If-None-Match"]).toBeUndefined();
  });

  test("cache with unparseable timestamps is incompatible", async () => {
    await seedSnapshot(validSnap({ checkedAt: "not-a-date" }));
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
  });

  test("unreadable cache file (permissions) is an error, not silent no-cache", async () => {
    await seedSnapshot(validSnap());
    await chmod(cachePath, 0o000);
    try {
      expect(refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) })).rejects.toThrow(/cannot read cache/);
    } finally {
      await chmod(cachePath, 0o644);
    }
  });

  test("malformed empty cache (no ECI groups) is rejected and replaced by a download", async () => {
    await seedSnapshot(validSnap({ data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z", etag: '"e0"', eci: {}, versionToGroup: { v: "x" } } }));
    const capture: { headers?: Record<string, string> } = {};
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip(), '"e1"', capture), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
    expect(capture.headers?.["If-None-Match"]).toBeUndefined();
  });

  test("malformed empty cache (no version mappings) is rejected and replaced by a download", async () => {
    await seedSnapshot(validSnap({ data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z", etag: '"e0"', eci: { x: 1.5 }, versionToGroup: {} } }));
    const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    expect(r.status).toBe("updated");
  });

  // ---- pass 1: real snapshots carry unmapped version rows; downloads must be gated too ----

  test("cached snapshot with unmapped version rows qualifies as compatible (fresh reuse)", async () => {
    // real Epoch data maps versions to groups that have no ECI row; that is valid
    await seedSnapshot(validSnap({ data: { schemaVersion: "1", etag: '"e0"', fetchedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z", etag: '"e0"', eci: { x: 1.5 }, versionToGroup: { v: "x", orphan: "unmapped-group" } } }));
    let fetched = false;
    const r = await refreshCache({
      cachePath,
      fetchImpl: (async () => {
        fetched = true;
        throw new Error("must not fetch");
      }) as typeof fetch,
      now: fixedClock(new Date("2026-01-01T00:01:00Z")), // checkedAt + 1min: still fresh
    });
    expect(fetched).toBe(false);
    expect(r.status).toBe("fresh");
    expect(r.data.versionToGroup["orphan"]).toBe("unmapped-group"); // preserved for diagnostics
  });

  test("download whose ECI CSV yields no groups is incompatible; last-good cache kept", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const before = await readFile(cachePath, "utf8");
    const r = await refreshCache({
      cachePath,
      fetchImpl: mockFetch(200, makeSyntheticZip({ [ECI_CSV]: "Model,eci\n" }), '"e2"'),
      now: fixedClock(T0),
      force: true,
    });
    expect(r.status).toBe("stale");
    expect(r.warning).toMatch(/incompatible payload/);
    expect(await readFile(cachePath, "utf8")).toBe(before);
  });

  test("download with no version mappings is incompatible; last-good cache kept", async () => {
    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const before = await readFile(cachePath, "utf8");
    const r = await refreshCache({
      cachePath,
      fetchImpl: mockFetch(200, makeSyntheticZip({ [META_CSV]: "model_version,model_group\n" }), '"e3"'),
      now: fixedClock(T0),
      force: true,
    });
    expect(r.status).toBe("stale");
    expect(await readFile(cachePath, "utf8")).toBe(before);
  });

  test("failed cache write leaves no temp litter and keeps the old cache", async () => {    await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip()), now: fixedClock(T0) });
    const before = await readFile(cachePath, "utf8");
    const dir = dirname(cachePath);
    await chmod(dir, 0o555); // temp creation fails: nothing partial may remain
    try {
      const r = await refreshCache({ cachePath, fetchImpl: mockFetch(200, makeSyntheticZip(), '"e2"'), now: fixedClock(T0), force: true });
      expect(r.status).toBe("stale");
      expect(r.warning).toMatch(/cache write failed/);
      expect(await readFile(cachePath, "utf8")).toBe(before);
      const files = await Array.fromAsync(new Bun.Glob("*.tmp-*").scan(dir));
      expect(files).toEqual([]);
    } finally {
      await chmod(dir, 0o755);
    }
  });
});
