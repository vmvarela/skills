import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, mkdir, stat, utimes, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writeConfig, WriteError, writeAll, LOCK_STALE_MS, validateSelection } from "../scripts/lib/writer.ts";
import { parseStrict } from "../scripts/lib/jsonc.ts";
import type { CatalogModel } from "../scripts/lib/types.ts";
import { isolatedEnv } from "./helpers.ts";

let root: string;
let target: string;

const FRESH_CATALOG: CatalogModel[] = [
  {
    providerID: "prov-a", modelID: "alpha-model", id: "prov-a/alpha-model", name: "Alpha", enabled: true,
    status: "active", tools: true, inputTypes: ["text", "image"], contextLimit: 200000,
    variants: ["high", "medium", "low", "minimal"], baseInput: 1, baseOutput: 2,
  },
];

function sel(over: Partial<Parameters<typeof writeConfig>[0]> = {}) {
  return {
    presetName: "optimized",
    mode: "create" as const,
    scope: "global" as const,
    // mandatory effective price: 1 + 2 * 3 (orchestrator weight)
    agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 7 } },
    targetPath: target,
    targetHash: null,
    catalog: FRESH_CATALOG,
    ...over,
  };
}

/** Hermetic write: explicit env so an ambient OH_MY_OPENCODE_SLIM_PRESET from
 * the host shell can never change what these tests expect to be written. */
function wc(input: Parameters<typeof writeConfig>[0], extra: Record<string, string> = {}) {
  return writeConfig(input, isolatedEnv(root, extra));
}

async function parseTarget() {
  return (await parseStrict(await readFile(target, "utf8"))).value as Record<string, any>;
}

const COMMENTED_CONFIG = `{
  // keep me
  "preset": "default",
  "presets": {
    "default": {
      "orchestrator": { "model": "old/x", "variant": "high" } // trailing comment
    }
  },
  "extras": { "keep": true },
}`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "po-write-"));
  target = join(root, "cfg", "oh-my-opencode-slim.jsonc");
  await mkdir(join(root, "cfg"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writer", () => {
  // ---- hermeticity: writes must never escape the temp root ----

  test("write results stay inside the temp root under explicit isolated env", async () => {
    const created = await wc(sel()); // no file yet: pure create, no backup
    expect("conflict" in created).toBe(false);
    expect(created.targetPath.startsWith(root + "/")).toBe(true);
    expect(created.backupPath).toBeNull();
    await writeFile(target, COMMENTED_CONFIG);
    const r = await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect("conflict" in r).toBe(false);
    expect(r.targetPath.startsWith(root + "/")).toBe(true);
    expect(r.backupPath!.startsWith(root + "/")).toBe(true);
  });

  test("create: new file gets the presets envelope as valid JSONC", async () => {
    const r = await wc(sel());
    expect(r.created).toBe(true);
    expect(r.backupPath).toBeNull();
    const parsed = await parseTarget();
    expect(parsed.preset).toBe("optimized");
    expect(parsed.presets.optimized.orchestrator).toEqual({ model: "prov-a/alpha-model", variant: "high" });
  });

  test("new preset becomes active only when the config has no selection", async () => {
    await writeFile(target, `{"extras": true}`);
    const r = await wc(sel({ targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect("conflict" in r).toBe(false);
    expect((await parseTarget()).preset).toBe("optimized");
  });

  test("environment selection keeps the file field unset and is reported", async () => {
    await writeFile(target, `{"extras": true}`);
    const r = await wc(
      sel({ targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }),
      { OH_MY_OPENCODE_SLIM_PRESET: "environment-choice" },
    );
    expect("conflict" in r).toBe(false);
    // environment authority: the file default is NOT initialized while the env pins the choice
    expect((await parseTarget()).preset).toBeUndefined();
    expect(r.warnings.join(" ")).toContain('environment-selected preset "environment-choice"');
  });

  test("inherited merged-layer preset is preserved and reported; file field stays unset", async () => {
    await writeFile(target, `{"extras": true}`);
    const r = await wc(sel({ effectiveActivePreset: "layer-choice", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect("conflict" in r).toBe(false);
    expect((await parseTarget()).preset).toBeUndefined(); // inherited selection preserved, not overwritten
    expect(r.warnings.join(" ")).toContain('inherited active preset "layer-choice"');
  });

  test("no active-preset warning when the inherited selection equals the written name", async () => {
    await writeFile(target, `{"extras": true}`);
    const r = await wc(sel({ effectiveActivePreset: "optimized", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect("conflict" in r).toBe(false);
    expect(r.warnings.join(" ")).not.toMatch(/not active/);
    expect((await parseTarget()).preset).toBeUndefined(); // set-if-unset does not duplicate the inherited choice
  });

  test("create: a new preset in an EXISTING config succeeds; active preset and unrelated data survive", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const r = await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect("conflict" in r).toBe(false);
    expect(r.created).toBe(false);
    expect(r.backupPath).toBe(`${target}.preset-optimizer.bak`);
    const parsed = await parseTarget();
    expect(parsed.preset).toBe("default"); // untouched
    expect(parsed.extras).toEqual({ keep: true }); // untouched
    expect(parsed.presets.default.orchestrator.model).toBe("old/x"); // untouched
    expect(parsed.presets.optimized.orchestrator.model).toBe("prov-a/alpha-model");
  });

  test("create: same-name preset conflict returned as {conflict:true}; force overwrites ONLY that preset", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const hash = createHash("sha256").update(await readFile(target)).digest("hex");
    const c = await wc(sel({ mode: "create", presetName: "default", targetHash: hash }));
    expect("conflict" in c && c.conflict).toBe(true);
    // nothing written, no backup yet
    expect(await readFile(target, "utf8")).toBe(COMMENTED_CONFIG);
    const r = await wc(sel({ mode: "create", presetName: "default", targetHash: hash, force: true }));
    expect("conflict" in r).toBe(false);
    const parsed = await parseTarget();
    expect(parsed.preset).toBe("default");
    expect(parsed.extras).toEqual({ keep: true }); // other data preserved
    expect(parsed.presets.default.orchestrator.model).toBe("prov-a/alpha-model"); // only this preset overwritten
    expect(await readFile(`${target}.preset-optimizer.bak`, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("edit: wrapped {extends, agents} preset keeps its shape and merges into the agent object", async () => {
    // fixture is schema-valid per the installed Slim 3.0.5 PresetSchema xor:
    // preset-level extras beyond {extends, agents, marketplace} would make the
    // layer dead, and the writer refuses those (see the schema-gate tests below)
    await writeFile(target, `{
  // keep me
  "preset": "default",
  "presets": {
    "optimized": {
      "extends": "base",
      "agents": { "orchestrator": { "model": "old/x", "temperature": 0.5 } },
      "marketplace": { "agents": ["pkg/keep-me"] }
    }
  },
}`);
    const r = await wc(sel({ mode: "edit", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect(r.commentsPreserved).toBe(true);
    const parsed = await parseTarget();
    const p = parsed.presets.optimized;
    expect(p.extends).toBe("base"); // wrapped shape kept
    expect(p.marketplace).toEqual({ agents: ["pkg/keep-me"] }); // preset-level extras kept
    expect(p.agents.orchestrator).toEqual({ model: "prov-a/alpha-model", temperature: 0.5, variant: "high" }); // merged
    expect(JSON.parse(JSON.stringify(parsed))).toHaveProperty("preset", "default");
  });

  test("edit: flat preset merges model/variant, preserving sibling agent keys", async () => {
    await writeFile(target, `{
  "presets": {
    "optimized": { "orchestrator": { "model": "old/x", "variant": "low", "temperature": 0.2, "options": { "a": 1 } } }
  }
}`);
    await wc(sel({ mode: "edit", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    const parsed = await parseTarget();
    expect(parsed.presets.optimized.orchestrator).toEqual({
      model: "prov-a/alpha-model", variant: "high", temperature: 0.2, options: { a: 1 },
    });
  });

  test("regression: flat custom agent named `agents` is never mistaken for the {extends, agents} wrapper", async () => {
    // Slim 3.0.5 PresetSchema: the value of a flat agent key named `agents`
    // (here an agent override {model, variant}) does not satisfy the strict
    // {extends?, agents: Record<agent, override>, marketplace?} definition
    // shape, so the preset is flat — edits must land beside it, not inside it
    await writeFile(target, `{
  "presets": {
    "p": {
      "agents": { "model": "provider/custom", "variant": "high" },
      "orchestrator": { "model": "old/x", "temperature": 0.5 }
    }
  }
}`);
    const r = await wc(
      sel({
        mode: "edit",
        presetName: "p",
        // oracle effective price: 1 + 2 * 4 (oracle output weight)
        agents: { oracle: { model: "prov-a/alpha-model", variant: "high", price: 9 } },
        targetHash: createHash("sha256").update(await readFile(target)).digest("hex"),
      }),
    );
    expect("conflict" in r).toBe(false);
    const parsed = await parseTarget();
    const p = parsed.presets.p;
    expect(p.oracle).toEqual({ model: "prov-a/alpha-model", variant: "high" }); // update lands flat, beside the custom agent
    expect(p.agents).toEqual({ model: "provider/custom", variant: "high" }); // custom `agents` agent preserved untouched
    expect(p.orchestrator.model).toBe("old/x"); // sibling data preserved
  });

  test("schema gate: preset-level extra keys (dead layer) abort before backup/rename", async () => {
    // preset-level `skills` matches NO PresetSchema xor shape in Slim 3.0.5:
    // the loader would skip the whole layer, so the write is refused
    await writeFile(target, `{
  "presets": {
    "default": { "extends": "base", "agents": { "orchestrator": { "model": "old/x" } }, "skills": ["x"] }
  }
}`);
    const before = await readFile(target, "utf8");
    expect(
      wc(sel({ mode: "edit", presetName: "default", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") })),
    ).rejects.toThrow(/plugin schema/);
    expect(await readFile(target, "utf8")).toBe(before);
    expect(await stat(`${target}.preset-optimizer.bak`).catch(() => null)).toBeNull();
  });

  test.each(["agents", "agents_add", "agents_remove"])("schema gate rejects whitespace-duplicate marketplace %s before backup", async (key) => {
    const config = `{"presets":{"default":{"extends":"base","agents":{"orchestrator":{"model":"old/x"}},"marketplace":{"${key}":["author/pkg"," author/pkg "]}}}}`;
    await writeFile(target, config);
    await expect(wc(sel({ mode: "edit", presetName: "default", targetHash: createHash("sha256").update(config).digest("hex") })))
      .rejects.toThrow(/plugin schema|duplicate package IDs/);
    expect(await readFile(target, "utf8")).toBe(config);
    expect(await stat(`${target}.preset-optimizer.bak`).catch(() => null)).toBeNull();
  });

  test("schema gate: ambiguous preset ({agents} that is both wrapper and empty override) aborts", async () => {
    await writeFile(target, `{"presets": {"default": {"extends": "base", "agents": {}}}}`);
    const before = await readFile(target, "utf8");
    expect(
      wc(sel({ mode: "edit", presetName: "default", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") })),
    ).rejects.toThrow(/ambiguous|plugin schema/);
    expect(await readFile(target, "utf8")).toBe(before);
  });

  test("root `agents` map is never used as preset storage", async () => {
    await writeFile(target, `{"agents": {"orchestrator": {"model": "runtime/x"}}, "extras": true}`);
    await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    const parsed = await parseTarget();
    expect(parsed.agents.orchestrator).toEqual({ model: "runtime/x" }); // untouched
    expect(parsed.presets.optimized.orchestrator.model).toBe("prov-a/alpha-model"); // written here instead
  });

  test("active preset is never changed and a mismatch is reported", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const r = await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect(r.warnings.join(" ")).toMatch(/active preset "default" left unchanged/);
    expect((await parseTarget()).preset).toBe("default");
  });

  test("environment-selected preset is preserved while a missing file default is initialized", async () => {
    await writeFile(target, `{"extras": true}`);
    const r = await wc(
      sel({ targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }),
      { OH_MY_OPENCODE_SLIM_PRESET: "environment-choice" },
    );
    expect("conflict" in r).toBe(false);
    expect((await parseTarget()).preset).toBeUndefined();
    expect(r.warnings.join(" ")).toContain('environment-selected preset "environment-choice"');
  });

  test("edit: preserves comments and extras", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const r = await wc(sel({ mode: "edit", presetName: "default", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    expect(r.commentsPreserved).toBe(true);
    const text = await readFile(target, "utf8");
    expect(text).toContain("// keep me");
    const parsed = await parseTarget();
    expect(parsed.extras).toEqual({ keep: true });
    expect(parsed.presets.default.orchestrator.model).toBe("prov-a/alpha-model");
  });

  test("edit: unknown preset name fails without writes", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    expect(
      wc(sel({ mode: "edit", presetName: "missing", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") })),
    ).rejects.toThrow(/requires existing preset/);
    expect(await readFile(target, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("invalid preset names are rejected", async () => {
    for (const bad of ["", "../escape", "a b", "-lead", "x".repeat(65)]) {
      expect(wc(sel({ presetName: bad }))).rejects.toThrow(/presetName/);
    }
    expect(wc(sel({ presetName: "OK.name-1" }))).resolves.toBeTruthy();
  });

  test("stale targetHash aborts with no damage", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const before = await readFile(target, "utf8");
    expect(wc(sel({ mode: "edit", targetHash: "d".repeat(64) }))).rejects.toThrow(WriteError);
    expect(await readFile(target, "utf8")).toBe(before);
    expect(await stat(`${target}.preset-optimizer.bak`).catch(() => null)).toBeNull();
  });

  test("target appeared after list (empty hash, file exists) aborts", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    expect(wc(sel({ mode: "create", targetHash: null }))).rejects.toThrow(/appeared since selection/);
    expect(await readFile(target, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("target vanished after list aborts", async () => {
    expect(wc(sel({ mode: "create", targetHash: "a".repeat(64) }))).rejects.toThrow(/vanished/);
  });

  test("duplicate keys in target fail closed", async () => {
    await writeFile(target, '{"presets": {}, "presets": {}}');
    const input = sel({ mode: "edit", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") });
    expect(wc(input)).rejects.toThrow(/duplicate key/);
  });

  test("malformed target fails closed without writes", async () => {
    await writeFile(target, "{ presets: ,");
    const input = sel({ mode: "edit", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") });
    expect(wc(input)).rejects.toThrow();
    const files = await Array.fromAsync(new Bun.Glob("*").scan(root));
    expect(files.every((f) => !f.includes(".bak"))).toBe(true);
  });

  test("symlink target is refused", async () => {
    const real = join(root, "real.jsonc");
    await writeFile(real, "{}");
    await writeFile(target, COMMENTED_CONFIG);
    const { symlink } = await import("node:fs/promises");
    await symlink(real, join(root, "link.jsonc"));
    expect(wc(sel({ targetPath: join(root, "link.jsonc") }))).rejects.toThrow(/symlink/);
  });

  test("backups are exclusive: second write never overwrites the first backup", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const hash = async () => createHash("sha256").update(await readFile(target)).digest("hex");
    const r1 = await wc(sel({ mode: "create", targetHash: await hash() }));
    expect(r1.backupPath).toBe(`${target}.preset-optimizer.bak`);
    const r2 = await wc(sel({ mode: "edit", targetHash: await hash() }));
    expect(r2.backupPath).toBe(`${target}.preset-optimizer.1.bak`);
    expect(await readFile(`${target}.preset-optimizer.bak`, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("backup preserves the file mode", async () => {
    await writeFile(target, COMMENTED_CONFIG, { mode: 0o600 });
    await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    const s = await stat(`${target}.preset-optimizer.bak`);
    expect(s.mode & 0o777).toBe(0o600);
  });

  test("backup restores the original mode after a successful write, restrictive during construction", async () => {
    const { chmod: chmodPath } = await import("node:fs/promises");
    await writeFile(target, COMMENTED_CONFIG);
    await chmodPath(target, 0o646); // chmod is not umask-masked
    const oldUmask = process.umask(0o077); // would leak into a plain create; must not widen/narrow wrongly
    try {
      await wc(sel({ mode: "create", targetHash: createHash("sha256").update(await readFile(target)).digest("hex") }));
    } finally {
      process.umask(oldUmask);
    }
    const s = await stat(`${target}.preset-optimizer.bak`);
    expect(s.mode & 0o777).toBe(0o646); // original safe mode applied after the successful write
  });

  test("held lock times out; stale lock is broken", async () => {
    await writeFile(target + ".lock", "999999\n");
    expect(wc(sel())).rejects.toThrow(/lock/);
    const old = new Date(Date.now() - LOCK_STALE_MS - 1000);
    await utimes(target + ".lock", old, old);
    const r = await wc(sel());
    expect(r.created).toBe(true);
    expect(await stat(target + ".lock").catch(() => null)).toBeNull();
  });

  test("selection no longer in fresh catalog aborts before any write", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const input = sel({ mode: "edit", agents: { orchestrator: { model: "prov-a/gone-model", variant: "high" } } });
    expect(wc(input)).rejects.toThrow(WriteError);
  });

  test("price change between selection and write aborts", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const input = sel({ mode: "edit", agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 999 } } });
    expect(wc(input)).rejects.toThrow(/price changed/);
  });

  test("variant not supported aborts", async () => {
    expect(wc(sel({ agents: { orchestrator: { model: "prov-a/alpha-model", variant: "xhigh", price: 7 } } }))).rejects.toThrow(/variant/);
  });

  // ---- selection validation hardening ----

  test("omitted selection price is rejected before any write", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const input = sel({ mode: "edit", agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high" } } });
    expect(wc(input)).rejects.toThrow(/must be a finite nonnegative number/);
    expect(await readFile(target, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("tampered selection price aborts against the fresh catalog price", async () => {
    const input = sel({ agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 999 } } });
    expect(wc(input)).rejects.toThrow(/price changed/);
  });

  test("required profile capabilities and context are validated", () => {
    const lowCtx: CatalogModel = { ...FRESH_CATALOG[0], contextLimit: 64_000 };
    // orchestrator needs 128k
    expect(() => validateSelection([lowCtx], "orchestrator", "prov-a/alpha-model", "high", 7)).toThrow(/context/);
    const noTools: CatalogModel = { ...FRESH_CATALOG[0], tools: false };
    expect(() => validateSelection([noTools], "orchestrator", "prov-a/alpha-model", "high", 7)).toThrow(/tools/);
    const noText: CatalogModel = { ...FRESH_CATALOG[0], inputTypes: ["image"] };
    expect(() => validateSelection([noText], "fixer", "prov-a/alpha-model", "low", 0.85)).toThrow(/text/);
    const noImage: CatalogModel = { ...FRESH_CATALOG[0], inputTypes: ["text"] };
    expect(() => validateSelection([noImage], "designer", "prov-a/alpha-model", "medium", 7)).toThrow(/vision/);
    // oracle needs 200k
    const ctx150k: CatalogModel = { ...FRESH_CATALOG[0], contextLimit: 150_000 };
    expect(() => validateSelection([ctx150k], "oracle", "prov-a/alpha-model", "max", 9999)).toThrow(/context/);
  });

  test("variant must be the exact supported id and an approved ladder member", () => {
    expect(() => validateSelection(FRESH_CATALOG, "orchestrator", "prov-a/alpha-model", "HIGH", 7)).toThrow(/not supported/);
    // catalog supports xhigh but it is not in the orchestrator ladder
    const withXhigh: CatalogModel = { ...FRESH_CATALOG[0], variants: ["high", "xhigh"] };
    expect(() => validateSelection([withXhigh], "orchestrator", "prov-a/alpha-model", "xhigh", 7)).toThrow(/ladder/);
  });

  test("proper supported ladder variant passes with matching price", () => {
    expect(validateSelection(FRESH_CATALOG, "orchestrator", "prov-a/alpha-model", "high", 7)).toBe(7);
    expect(validateSelection(FRESH_CATALOG, "fixer", "prov-a/alpha-model", "low", 4)).toBe(4); // 1 + 2*1.5
  });

  test("no writes on validation failure (atomic temp cleanup)", async () => {
    await writeFile(target, COMMENTED_CONFIG);
    const before = await readFile(target, "utf8");
    expect(wc(sel({ mode: "edit", targetHash: "mismatch" }))).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe(before);
    const files = await Array.fromAsync(new Bun.Glob("*").scan(root));
    expect(files.every((f) => !f.includes(".tmp-"))).toBe(true);
  });

  test("temp-file write failure aborts with no target damage and no temp litter", async () => {
    // fresh create: only two FileHandle writes happen (lock file, temp config)
    // (Bun's node:fs/promises does not export FileHandle; take it from a probe)
    const probePath = join(root, "probe.tmp");
    const probe = await open(probePath, "w");
    const FH = probe.constructor as typeof import("node:fs/promises").FileHandle;
    await probe.close();
    await rm(probePath, { force: true });
    const origWrite = FH.prototype.write;
    let writes = 0;
    FH.prototype.write = function (...args: unknown[]) {
      // first call is the lock-file write (passes); second is the temp config write
      if (++writes === 2) return Promise.reject(new Error("simulated ENOSPC"));
      return origWrite.apply(this, args as Parameters<typeof origWrite>);
    };
    try {
      expect(wc(sel())).rejects.toThrow(/temp write failed/);
    } finally {
      FH.prototype.write = origWrite;
    }
    expect(await stat(target).catch(() => null)).toBeNull(); // no target created
    const files = await Array.fromAsync(new Bun.Glob("*").scan(root));
    expect(files.every((f) => !f.includes(".tmp-"))).toBe(true); // temp cleaned up
  });

  // ---- full-write guarantee (short writes must not silently truncate) ----

  test("writeAll loops until every byte is written (stub returning partial writes)", async () => {
    let chunks: Buffer[] = [];
    const fake = {
      write: async (buf: Buffer, offset: number) => {
        const n = Math.min(3, buf.length - offset); // at most 3 bytes per call
        chunks.push(buf.subarray(offset, offset + n));
        return { bytesWritten: n };
      },
    } as unknown as import("node:fs/promises").FileHandle;
    await writeAll(fake, "hello world");
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
  });

  test("writeAll aborts when a write makes no progress", async () => {
    const fake = {
      write: async () => ({ bytesWritten: 0, buffer: Buffer.alloc(0) }),
    } as unknown as import("node:fs/promises").FileHandle;
    expect(writeAll(fake, "data")).rejects.toThrow(/short write/);
  });

  test("forced short temp write is completed by the loop: full content lands", async () => {
    const probePath = join(root, "probe.tmp");
    const probe = await open(probePath, "w");
    const FH = probe.constructor as typeof import("node:fs/promises").FileHandle;
    await probe.close();
    await rm(probePath, { force: true });
    const origWrite = FH.prototype.write;
    let calls = 0;
    FH.prototype.write = function (...args: unknown[]) {
      // call 1 = lock file; the first temp-config write (call 2) REALLY writes only
      // its first 3 bytes and reports a short write of 3
      if (++calls === 2) {
        const [buf] = args as [Buffer];
        return origWrite.call(this, buf, 0, 3, 0) as unknown as Promise<{ bytesWritten: number; buffer: Buffer }>;
      }
      return origWrite.apply(this, args as Parameters<typeof origWrite>);
    };
    try {
      const r = await wc(sel());
      expect(r.created).toBe(true);
    } finally {
      FH.prototype.write = origWrite;
    }
    const parsed = await parseTarget();
    expect(parsed.preset).toBe("optimized");
    expect(parsed.presets.optimized.orchestrator).toEqual({ model: "prov-a/alpha-model", variant: "high" });
  });
});
