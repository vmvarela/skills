import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, mkdir, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreReport, refreshSummary, enforceOperativeTarget, defaultCachePath } from "../scripts/lib/report.ts";
import { fetchCatalog } from "../scripts/lib/catalog.ts";
import { resolveConfig } from "../scripts/lib/config.ts";
import { synthCatalogResponse, synthModel, isolatedEnv, assertPathsUnderRoot } from "./helpers.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "po-cli-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const CWD = "/tmp/po-test-cwd";

/**
 * Strips config overrides inherited from the host (HOME, XDG_*, OPENCODE_*,
 * OH_MY_OPENCODE_*, PRESET_OPTIMIZER_CATALOG_FILE) and pins HOME, XDG and
 * OPENCODE_TEST_HOME to the temp root (via the shared isolatedEnv), so spawned
 * CLI processes never touch real user config.
 */
function hermeticEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "HOME" || k.startsWith("OPENCODE_") || k.startsWith("XDG_") || k.startsWith("OH_MY_OPENCODE_") || k === "PRESET_OPTIMIZER_CATALOG_FILE") continue;
    env[k] = v;
  }
  return { ...env, HOME: root, ...isolatedEnv(root, extra) };
}

// SYNTHETIC epoch data — not a real Epoch snapshot
const EPOCH = {
  schemaVersion: "1",
  fetchedAt: "2026-01-01T00:00:00Z",
  checkedAt: "2026-01-01T00:00:00Z",
  etag: null,
  eci: { "alpha-model": 150, "beta-model": 120 },
  versionToGroup: { "alpha-model_high": "alpha-model", "beta-model_max": "beta-model" },
};

const now = () => new Date("2026-10-19T00:00:00Z");

async function cacheWithSyntheticEpoch(): Promise<string> {
  // seed a compatible, FRESH cache (checkedAt == mock clock) so no network is used
  const cachePath = join(root, "epoch-cache.json");
  const data = { ...EPOCH, fetchedAt: now().toISOString(), checkedAt: now().toISOString() };
  await writeFile(cachePath, JSON.stringify({ schemaVersion: "1", etag: null, fetchedAt: data.fetchedAt, checkedAt: data.checkedAt, data }));
  return cachePath;
}

const noFetch = (async () => {
  throw new Error("must not fetch");
}) as typeof fetch;

const synthCatalog = async (cwd: string) => {
  // raw synthetic entries converted through the same safe-field path as production
  return fetchCatalog(cwd, () => ({
    code: 0,
    stdout: synthCatalogResponse(
      [
        synthModel({ id: "alpha-model", modelID: "alpha-model", providerID: "prov-a", variants: ["high", "max"], inputPrice: 1, outputPrice: 2 }),
        synthModel({ id: "beta-model", modelID: "beta-model", providerID: "prov-b", variants: ["max"], inputPrice: 5, outputPrice: 1 }),
      ],
      cwd,
    ),
    stderr: "",
  }));
};


describe("report shapes", () => {
  test("refreshSummary reports stale/validated flags", async () => {
    const cachePath = await cacheWithSyntheticEpoch();
    let fetched = false;
    const s = await refreshSummary({
      cachePath,
      fetchImpl: (async () => {
        fetched = true;
        throw new Error("no");
      }) as typeof fetch,
      now,
    });
    expect(fetched).toBe(false);
    expect(s.stale).toBe(false);
    expect(s.cacheValidated).toBe(true);
  });

  test("scoreReport emits the documented exact schema with labels/prices/recommended", async () => {
    const cachePath = await cacheWithSyntheticEpoch();
    const r = await scoreReport(1, CWD, { cachePath, catalogImpl: synthCatalog, now, fetchImpl: noFetch });
    expect(Object.keys(r)).toEqual(["generatedAt", "cache", "topPerProvider", "agents"]);
    expect(r.generatedAt).toBe("2026-10-19T00:00:00.000Z");
    expect(r.cache).toEqual({ fetchedAt: "2026-10-19T00:00:00.000Z", checkedAt: "2026-10-19T00:00:00.000Z", stale: false });
    expect(r.topPerProvider).toBe(1);
    expect(r.agents.map((a) => a.agent)).toEqual(["orchestrator", "oracle", "council", "explorer", "designer", "fixer"]);
    expect(r.agents.map((a) => a.label)).toEqual(["Orchestrator", "Oracle", "Council", "Explorer", "Designer", "Fixer"]);
    const orch = r.agents[0];
    expect(orch.bestEci).toBe(150);
    expect(orch.qualityFloor).toBe(140);
    const o = orch.options[0];
    expect(o.provider).toBe("prov-a");
    expect(o.model).toBe("prov-a/alpha-model");
    expect(o.variant).toBe("high");
    expect(o.eci).toBe(150);
    expect(o.price).toEqual({ inputPer1M: 1, outputPer1M: 2, effectivePer1M: 7, currency: "USD" });
    expect(o.context).toBe(200000);
    expect(o.vision).toBe(true);
    expect(o.tools).toBe(true);
    expect(o.recommended).toBe(true);
    expect(orch.options.length).toBe(1); // beta (120) below floor, excluded before capping
    // beta (120) is below the orchestrator floor -> unmatchedQuality counted
    expect(Object.keys(orch.excluded)).toEqual(["unmatchedQuality"]);
    // beta (120) below floor -> unmatchedQuality counted for orchestrator
    const r2 = await scoreReport(2, CWD, { cachePath, catalogImpl: synthCatalog, now, fetchImpl: noFetch });
    expect(r2.agents[0].excluded.unmatchedQuality).toBe(1);
  });
});

describe("operative target enforcement (finding 4)", () => {
  test("rejects a target that is not the currently resolved operative destination", async () => {
    const resolution = await resolveConfig(join(root, "nowhere"), isolatedEnv(root));
    assertPathsUnderRoot(root, resolution, "operative-target resolution");
    expect(() => enforceOperativeTarget(resolution, "/arbitrary/absolute/path.jsonc", "global")).toThrow(/operative destination/);
    // operative destination with no config anywhere in the isolated root: global default
    expect(() =>
      enforceOperativeTarget(resolution, resolution.operative.path, resolution.operative.scope),
    ).not.toThrow();
  });

  test("precedence change after --list aborts: a nearer project config appears", async () => {
    const cwd = join(root, "ws", "deep");
    await mkdir(cwd, { recursive: true });
    const before = await resolveConfig(cwd, isolatedEnv(root));
    assertPathsUnderRoot(root, before, "operative precedence: before");
    expect(before.operative.scope).toBe("global");
    // a project config appears during the interaction
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), "{}");
    const after = await resolveConfig(cwd, isolatedEnv(root));
    assertPathsUnderRoot(root, after, "operative precedence: after");
    expect(after.operative.scope).toBe("project");
    expect(() => enforceOperativeTarget(after, before.operative.path, before.operative.scope)).toThrow(/operative destination/);
  });

  test("write-preset.ts --list and --input - end-to-end in an isolated env (no user config touched)", async () => {
    const gDir = join(root, "cfgdir");
    const cwd = join(root, "proj");
    await mkdir(join(gDir), { recursive: true });
    await mkdir(cwd, { recursive: true });
    // hermetic catalog fixture: no live opencode/model/price dependency
    // (process.cwd() resolves symlinks on macOS, so the fixture must use the same form)
    const resolvedCwd = await realpath(cwd);
    const catalogFile = join(root, "catalog-fixture.json");
    await writeFile(
      catalogFile,
      synthCatalogResponse(
        [
          synthModel({ id: "alpha-model", modelID: "alpha-model", providerID: "prov-a", variants: ["high", "medium", "low", "minimal"], inputPrice: 1, outputPrice: 2, context: 200000 }),
        ],
        resolvedCwd,
      ),
    );
    const baseEnv = hermeticEnv({ OPENCODE_CONFIG_DIR: gDir, OPENCODE_DISABLE_PROJECT_CONFIG: "", PRESET_OPTIMIZER_CATALOG_FILE: catalogFile });
    const script = join(import.meta.dir, "..", "scripts", "write-preset.ts");
    // Bun.spawnSync has no stdin option; pipe JSON via an env var
    const pipe = (json: string, extraEnv: Record<string, string> = {}) =>
      Bun.spawnSync(["sh", "-c", 'printf \'%s\' "$WRITE_JSON" | bun "$SCRIPT" --input -'], {
        cwd,
        env: { ...baseEnv, ...extraEnv, WRITE_JSON: json, SCRIPT: script },
        stdout: "pipe",
        stderr: "pipe",
      });

    const list = Bun.spawnSync(["bun", script, "--list"], { cwd, env: baseEnv, stdout: "pipe", stderr: "pipe" });
    expect(list.exitCode).toBe(0);
    const listed = JSON.parse(list.stdout.toString());
    // compact documented contract, not the raw Resolution
    expect(Object.keys(listed).sort()).toEqual(["activePreset", "contextToken", "diagnostics", "effective", "exists", "path", "presets", "scope", "targetHash"]);
    expect(listed.path).toBe(join(gDir, "oh-my-opencode-slim.jsonc"));
    expect(listed.scope).toBe("global");
    expect(listed.exists).toBe(false);
    expect(listed.targetHash).toBeNull();
    expect(listed.effective).toBe(true);
    expect(listed.contextToken).toMatch(/^[0-9a-f]{64}$/);

    // write with a mismatching arbitrary target -> rejected, nothing written
    const bad = pipe(
      JSON.stringify({ presetName: "p", mode: "create", scope: "global", targetPath: join(root, "elsewhere.jsonc"), targetHash: null, contextToken: listed.contextToken, agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 7 } } }),
    );
    expect(bad.exitCode).toBe(1);
    expect(JSON.parse(bad.stderr.toString()).error).toMatch(/operative destination/);
    expect(await stat(join(gDir, "oh-my-opencode-slim.jsonc")).catch(() => null)).toBeNull();

    // stale context token (environment changed after --list) -> rejected, nothing written
    const stale = pipe(
      JSON.stringify({ presetName: "p", mode: "create", scope: "global", targetPath: listed.path, targetHash: null, contextToken: listed.contextToken, agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 7 } } }),
      { OH_MY_OPENCODE_SLIM_PRESET: "sneaky" },
    );
    expect(stale.exitCode).toBe(1);
    expect(JSON.parse(stale.stderr.toString()).error).toMatch(/context changed|rerun/);
    expect(await stat(join(gDir, "oh-my-opencode-slim.jsonc")).catch(() => null)).toBeNull();

    // correct operative target, hash and context token from --list -> succeeds;
    // nothing is selected anywhere, so the writer initializes config.preset (set-if-unset)
    const targetPath = listed.path;
    // every file target lives inside the isolated temp root, never the real user config
    expect(targetPath.startsWith(root + "/")).toBe(true);
    const ok = pipe(
      JSON.stringify({ presetName: "balanced", mode: "create", scope: "global", targetPath, targetHash: listed.targetHash, contextToken: listed.contextToken, agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 7 } } }),
    );
    expect(ok.exitCode).toBe(0);
    const result = JSON.parse(ok.stdout.toString());
    expect("conflict" in result).toBe(false);
    expect(result.created).toBe(true);
    const written = JSON.parse(await readFile(targetPath, "utf8"));
    expect(written.preset).toBe("balanced");
    expect(written.presets.balanced.orchestrator.model).toBe("prov-a/alpha-model");
    expect(result.effective).toBe(true);

    // same-name create without force -> {conflict:true}, exit 0, other data intact
    const listed2 = JSON.parse(Bun.spawnSync(["bun", script, "--list"], { cwd, env: baseEnv, stdout: "pipe" }).stdout.toString());
    const conf = pipe(
      JSON.stringify({ presetName: "balanced", mode: "create", scope: "global", targetPath, targetHash: listed2.targetHash, contextToken: listed2.contextToken, agents: { fixer: { model: "prov-a/alpha-model", variant: "low", price: 4 } } }),
    );
    expect(conf.exitCode).toBe(0);
    expect(JSON.parse(conf.stdout.toString()).conflict).toBe(true);
    const after = JSON.parse(await readFile(targetPath, "utf8"));
    expect(after.presets.balanced.orchestrator.model).toBe("prov-a/alpha-model"); // untouched by conflict
    expect(after.presets.fixer).toBeUndefined(); // nothing written
  });

  test("--list reports effective:false and a diagnostic when an ancestor layer sets root `agents`", async () => {
    const gDir = join(root, "cfgdir3");
    const ancestor = join(root, "ws");
    const cwd = join(root, "ws", "deep");
    await mkdir(join(gDir), { recursive: true });
    await mkdir(join(ancestor, ".opencode"), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(ancestor, ".opencode", "oh-my-opencode-slim.jsonc"),
      `{"preset": "base", "presets": {"base": {}}, "agents": {"oracle": {"variant": "max"}}}`,
    );
    const env = hermeticEnv({ OPENCODE_CONFIG_DIR: gDir, OPENCODE_DISABLE_PROJECT_CONFIG: "" });
    const script = join(import.meta.dir, "..", "scripts", "write-preset.ts");
    const listed = JSON.parse(
      Bun.spawnSync(["bun", script, "--list"], { cwd, env, stdout: "pipe", stderr: "pipe" }).stdout.toString(),
    );
    expect(listed.effective).toBe(false);
    expect(listed.diagnostics.join(" ")).toMatch(/override the active preset for: oracle/);
    // contextToken derives from layer hashes, so any root-`agents` edit also invalidates it
    expect(listed.contextToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test("environment-selected preset reports how to change the shell override", async () => {
    const gDir = join(root, "cfgdir2");
    const cwd = join(root, "proj2");
    await mkdir(join(gDir), { recursive: true });
    await mkdir(cwd, { recursive: true });
    const catalogFile = join(root, "catalog-fixture2.json");
    await writeFile(
      catalogFile,
      synthCatalogResponse([synthModel({ id: "alpha-model", modelID: "alpha-model", providerID: "prov-a", variants: ["high"], inputPrice: 1, outputPrice: 2, context: 200000 })], await realpath(cwd)),
    );
    const env = hermeticEnv({ OPENCODE_CONFIG_DIR: gDir, PRESET_OPTIMIZER_CATALOG_FILE: catalogFile, OH_MY_OPENCODE_SLIM_PRESET: "other" });
    const script = join(import.meta.dir, "..", "scripts", "write-preset.ts");
    const pipe = (json: string) =>
      Bun.spawnSync(["sh", "-c", 'printf \'%s\' "$WRITE_JSON" | bun "$SCRIPT" --input -'], {
        cwd, env: { ...env, WRITE_JSON: json, SCRIPT: script }, stdout: "pipe", stderr: "pipe",
      });
    const listed = JSON.parse(Bun.spawnSync(["bun", script, "--list"], { cwd, env, stdout: "pipe" }).stdout.toString());
    expect(listed.activePreset).toBe("other"); // environment selection visible in --list
    const r = pipe(
      JSON.stringify({ presetName: "balanced", mode: "create", scope: "global", targetPath: listed.path, targetHash: listed.targetHash, contextToken: listed.contextToken, agents: { orchestrator: { model: "prov-a/alpha-model", variant: "high", price: 7 } } }),
    );
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout.toString());
    expect(out.effective).toBe(false);
    const diagnostics = out.diagnostics.join(" ");
    expect(diagnostics).toContain("unset OH_MY_OPENCODE_SLIM_PRESET");
    expect(diagnostics).toContain("then reload/re-run OpenCode");
    expect(diagnostics).toContain("/preset does not override the environment selection");
    expect(diagnostics).not.toContain("select it via /preset");
    // environment authority respected: file preset stays unset
    expect(JSON.parse(await readFile(listed.path, "utf8")).preset).toBeUndefined();
  });

  test("compute-score.ts wrapper validates --top bounds and exits 1", () => {
    const script = join(import.meta.dir, "..", "scripts", "compute-score.ts");
    const bad = Bun.spawnSync(["bun", script, "--top", "21"], { stdout: "pipe", stderr: "pipe", cwd: root, env: hermeticEnv() });
    expect(bad.exitCode).toBe(1);
    expect(JSON.parse(bad.stderr.toString()).error).toMatch(/--top/);
  });

  test("fetch-data.ts rejects unknown/malformed arguments (--force is the only flag)", () => {
    const script = join(import.meta.dir, "..", "scripts", "fetch-data.ts");
    const bad = Bun.spawnSync(["bun", script, "--bogus"], { stdout: "pipe", stderr: "pipe", cwd: root, env: hermeticEnv() });
    expect(bad.exitCode).toBe(1);
    expect(JSON.parse(bad.stderr.toString()).error).toMatch(/unknown argument/);
    const mixed = Bun.spawnSync(["bun", script, "--force", "--wat"], { stdout: "pipe", stderr: "pipe", cwd: root, env: hermeticEnv() });
    expect(mixed.exitCode).toBe(1);
    expect(JSON.parse(mixed.stderr.toString()).error).toMatch(/unknown argument/);
  });

  test("cache artifact default path stays inside the skill dir", async () => {
    const skillDir = await realpath(join(import.meta.dir, ".."));
    expect(defaultCachePath()).toBe(join(skillDir, "cache", "epoch-cache.json"));
  });

  test("hermetic env strips inherited config overrides and pins HOME/XDG to the temp root", () => {
    const prevConfig = process.env.OPENCODE_CONFIG;
    const prevContent = process.env.OPENCODE_CONFIG_CONTENT;
    process.env.OPENCODE_CONFIG = "/real/user/config.json";
    process.env.OPENCODE_CONFIG_CONTENT = "{}";
    try {
      const env = hermeticEnv({ OPENCODE_CONFIG_DIR: root });
      expect(env.OPENCODE_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
      expect(env.HOME).toBe(root);
      expect(env.XDG_CONFIG_HOME).toBe(root);
      expect(env.OPENCODE_TEST_HOME).toBe(root);
      expect(env.OPENCODE_CONFIG_DIR).toBe(root);
    } finally {
      if (prevConfig === undefined) delete process.env.OPENCODE_CONFIG;
      else process.env.OPENCODE_CONFIG = prevConfig;
      if (prevContent === undefined) delete process.env.OPENCODE_CONFIG_CONTENT;
      else process.env.OPENCODE_CONFIG_CONTENT = prevContent;
    }
  });
});
