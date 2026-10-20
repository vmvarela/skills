import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig, ConfigError, contextToken, slimSchemaInvalid } from "../scripts/lib/config.ts";
import { listContract, activationDiagnostics, enforceWriteContext } from "../scripts/lib/report.ts";
import { isolatedEnv, assertPathsUnderRoot } from "./helpers.ts";

let root: string;
let projectDir: string;

/** Isolated env for every resolveConfig call: no ambient HOME/XDG/OPENCODE_* anchor. */
const isolated = (extra: Record<string, string> = {}): Record<string, string> => isolatedEnv(root, extra);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "po-cfg-"));
  projectDir = join(root, "ws", "sub");
  await mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const CONFIG = `{
  // active preset comment
  "preset": "default",
  "presets": { "default": { "orchestrator": { "model": "a/x" } } },
}`;

describe("config resolution", () => {
  test("finds ancestor layers; the edit target stays the cwd's own config", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r = await resolveConfig(projectDir, isolated());
    assertPathsUnderRoot(root, r, "ancestor-layer resolution");
    // effective layer: the nearest existing project config (the ancestor here)
    expect(r.layers[0].path).toBe(join(cfgDir, "oh-my-opencode-slim.jsonc"));
    expect(r.layers[0].preset).toBe("default");
    expect(r.layers[0].presetNames).toEqual(["default"]);
    expect(r.layers[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.active).toBe(r.layers[0].path);
    expect(r.effectivePreset).toBe("default");
    // editable destination: the cwd's OWN file, never an inherited ancestor
    expect(r.project.exists).toBe(false);
    expect(r.project.path).toBe(join(projectDir, ".opencode", "oh-my-opencode-slim.jsonc"));
    expect(r.project.hash).toBeNull();
    expect(r.project.effective).toBe(true);
    expect(r.project.diagnostics.join(" ")).toMatch(/inherited project layer/);
    expect(r.operative).toEqual({ path: r.project.path, scope: "project" });
  });

  test("edit target uses the cwd's existing .json and prefers .jsonc when both exist", async () => {
    const own = join(projectDir, ".opencode");
    await mkdir(own, { recursive: true });
    await writeFile(join(own, "oh-my-opencode-slim.json"), CONFIG);
    const r = await resolveConfig(projectDir, isolated());
    expect(r.project.path).toBe(join(own, "oh-my-opencode-slim.json"));
    expect(r.project.exists).toBe(true);
    await writeFile(join(own, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r2 = await resolveConfig(projectDir, isolated());
    expect(r2.project.path).toBe(join(own, "oh-my-opencode-slim.jsonc"));
  });

  test("global resolution honors OPENCODE_CONFIG_DIR over XDG", async () => {
    const gdir = join(root, "gdir");
    await mkdir(gdir, { recursive: true });
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r.global.path).toBe(join(gdir, "oh-my-opencode-slim.jsonc"));
    expect(r.global.exists).toBe(false);
    expect(r.defaultCreatePath).toBe(r.global.path);
    const r2 = await resolveConfig(projectDir, isolated());
    expect(r2.global.path).toBe(join(root, "opencode", "oh-my-opencode-slim.jsonc"));
    assertPathsUnderRoot(root, r, "OPENCODE_CONFIG_DIR global scope");
    assertPathsUnderRoot(root, r2, "XDG global scope");
  });

  test("global falls back to .json when only the .json file exists", async () => {
    const gdir = join(root, "gdir2");
    await mkdir(gdir, { recursive: true });
    await writeFile(join(gdir, "oh-my-opencode-slim.json"), CONFIG);
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r.global.exists).toBe(true);
    expect(r.global.path).toBe(join(gdir, "oh-my-opencode-slim.json"));
    expect(r.global.preset).toBe("default");
    expect(r.operative).toEqual({ path: join(gdir, "oh-my-opencode-slim.json"), scope: "global" });
    // .jsonc wins when both exist
    await writeFile(join(gdir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r2 = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r2.global.path).toBe(join(gdir, "oh-my-opencode-slim.jsonc"));
  });

  test("operative destination: project edit target when a project config exists, else global default", async () => {
    const gdir = join(root, "gdir3");
    await mkdir(gdir, { recursive: true });
    const env = isolated({ OPENCODE_CONFIG_DIR: gdir });
    const r = await resolveConfig(projectDir, env);
    // no project config anywhere -> the global default is the operative target
    expect(r.operative).toEqual({ path: join(gdir, "oh-my-opencode-slim.jsonc"), scope: "global" });
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    // an inherited ancestor exists: the edit target is still the cwd's OWN file
    const r2 = await resolveConfig(projectDir, env);
    expect(r2.operative).toEqual({ path: join(projectDir, ".opencode", "oh-my-opencode-slim.jsonc"), scope: "project" });
    // creating the cwd's own config makes it the (existing) edit target
    await mkdir(join(projectDir, ".opencode"));
    await writeFile(join(projectDir, ".opencode", "oh-my-opencode-slim.jsonc"), CONFIG);
    const r3 = await resolveConfig(projectDir, env);
    expect(r3.operative).toEqual({ path: join(projectDir, ".opencode", "oh-my-opencode-slim.jsonc"), scope: "project" });
    expect(r3.project.exists).toBe(true);
    // disabled project walk -> global, even with existing project configs
    const r4 = await resolveConfig(projectDir, { ...env, OPENCODE_DISABLE_PROJECT_CONFIG: "1" });
    expect(r4.operative).toEqual({ path: join(gdir, "oh-my-opencode-slim.jsonc"), scope: "global" });
    assertPathsUnderRoot(root, r, "operative: no project config");
    assertPathsUnderRoot(root, r2, "operative: inherited ancestor");
    assertPathsUnderRoot(root, r4, "operative: disabled walk");
  });

  test("OPENCODE_DISABLE_PROJECT_CONFIG only true/1 disables the project walk", async () => {
    const cfgDir = join(projectDir, ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    for (const v of ["true", "1", "TRUE", "True"]) {
      const r = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: v }));
      expect(r.disableProjectConfig).toBe(true);
      // the walk is off: no project layer is collected and the target is inert
      expect(r.project.effective).toBe(false);
      expect(r.layers.some((l) => l.scope === "project")).toBe(false);
    }
    for (const v of ["yes", "0", "", "false", "enabled"]) {
      const r = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: v }));
      // plugin-like: anything other than true/1 keeps project discovery live
      expect(r.disableProjectConfig).toBe(false);
      expect(r.project.exists).toBe(true);
    }
    // verified plugin semantics: isProjectConfigDisabled does NOT trim, so
    // whitespace-wrapped values do NOT disable
    const r2 = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: " 1 " }));
    expect(r2.disableProjectConfig).toBe(false);
    expect(r2.project.exists).toBe(true);
  });

  test("unreadable config location is an error, not a silent fallback", async () => {
    const lockedDir = join(root, "locked", ".opencode");
    await mkdir(lockedDir, { recursive: true });
    await writeFile(join(lockedDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const cwd = join(root, "locked", "deep");
    await mkdir(cwd, { recursive: true });
    await chmod(join(root, "locked"), 0o000);
    try {
      let err: unknown;
      try {
        await resolveConfig(cwd, isolated());
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toMatch(/cannot inspect/);
    } finally {
      await chmod(join(root, "locked"), 0o755);
    }
  });

  test("OPENCODE_DISABLE_PROJECT_CONFIG disables the project walk", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: "1" }));
    expect(r.project.exists).toBe(false);
    expect(r.disableProjectConfig).toBe(true);
    expect(r.active).toBe(null);
  });

  test("global file is reported as shadowed while a live project config exists", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r = await resolveConfig(projectDir, isolated());
    assertPathsUnderRoot(root, r, "global-shadowed resolution");
    expect(r.global.effective).toBe(false);
    expect(r.global.diagnostics.join(" ")).toMatch(/overrides the global file/);
  });

  test("unparseable slim layer is skipped, reported, and never claimed effective", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), "{ presets: ,");
    const r = await resolveConfig(projectDir, isolated());
    // the malformed layer exists, is hashed, and is diagnosed
    expect(r.layers[0].exists).toBe(true);
    expect(r.layers[0].malformed).toBe(true);
    expect(r.layers[0].effective).toBe(false);
    expect(r.layers[0].preset).toBeNull();
    expect(r.layers[0].diagnostics.join(" ")).toMatch(/unparseable/);
    // loader semantics: a skipped layer contributes nothing
    expect(r.effectivePreset).toBeNull();
    // a malformed NON-target layer still blocks verified activation
    expect(listContract(r).effective).toBe(false);
    expect(listContract(r).diagnostics.join(" ")).toMatch(/unparseable; the loader skips it/);
    expect(activationDiagnostics(r, "p").effective).toBe(false);
  });

  test("unparseable edit-target file is reported as ineffective", async () => {
    const cfgDir = join(projectDir, ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), "{ presets: ,");
    const r = await resolveConfig(projectDir, isolated());
    expect(r.project.malformed).toBe(true);
    expect(r.project.effective).toBe(false);
    expect(listContract(r).effective).toBe(false);
    expect(activationDiagnostics(r, "p").effective).toBe(false);
  });

  // ---- review scope: environment layer, target-file root `agents`, host overrides ----

  test("OH_MY_OPENCODE_SLIM_PRESET is reported as overriding the file's preset", async () => {
    const cfgDir = join(projectDir, ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r = await resolveConfig(projectDir, isolated({ OH_MY_OPENCODE_SLIM_PRESET: "lean" }));
    expect(r.envPreset).toBe("lean");
    expect(r.project.diagnostics.join(" ")).toMatch(/environment-selected preset "lean"/);
    // effective active preset is the environment value, not the file's "default"
    expect(r.project.preset).toBe("default");
  });

  test("OH_MY_OPENCODE_SLIM_DISABLE marks every scope ineffective", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    for (const v of ["1", "true", "yes", "on", "YES", "On"]) {
      const r = await resolveConfig(projectDir, isolated({ OH_MY_OPENCODE_SLIM_DISABLE: v }));
      expect(r.pluginDisabled).toBe(true);
      expect(r.project.effective).toBe(false);
      expect(r.global.effective).toBe(false);
      expect(r.project.diagnostics.join(" ")).toMatch(/plugin is inactive/);
    }
    const r2 = await resolveConfig(projectDir, isolated({ OH_MY_OPENCODE_SLIM_DISABLE: "0" }));
    expect(r2.pluginDisabled).toBe(false);
  });

  test("top-level `agents` in the target file is reported as an active-preset override (names only)", async () => {
    const cfgDir = join(projectDir, ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), `{"preset": "default", "presets": {}, "agents": {"orchestrator": {"model": "root/x"}}}`);
    const r = await resolveConfig(projectDir, isolated());
    expect(r.project.rootAgentOverrides).toEqual(["orchestrator"]);
    expect(r.project.diagnostics.join(" ")).toMatch(/override the active preset for: orchestrator/);
  });

  test("host opencode.json agent entries are detected; values are never emitted", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(
      join(cfgDir, "opencode.json"),
      // host fixture with a secret-looking value that must never leak
      `{"agent": {"orchestrator": {"model": "host/x"}}, "provider": {"openai": {"apikey": "sk-SUPERSECRET"}}}`,
    );
    const gdir = join(root, "gdir");
    await mkdir(gdir, { recursive: true });
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r.host.configs.some((c) => c.path === join(cfgDir, "opencode.json"))).toBe(true);
    expect(r.host.configs.every((c) => /^[0-9a-f]{64}$/.test(c.hash))).toBe(true);
    expect(r.host.overriddenAgents).toContain("orchestrator"); // ambient machine ancestors may add more
    const dumped = JSON.stringify(r);
    expect(dumped).not.toContain("sk-SUPERSECRET");
    expect(dumped).not.toContain("host/x");
  });

  test("unparseable host config is reported and does not claim verified activation", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "opencode.jsonc"), "{ agent: ,");
    const gdir = join(root, "gdir2");
    await mkdir(gdir, { recursive: true });
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r.host.configs.some((c) => c.path === join(cfgDir, "opencode.jsonc"))).toBe(true);
    expect(r.host.diagnostics.join(" ")).toMatch(/unparseable; agent activation unverifiable/);
  });

  // ---- pass 1 remediation: layering, literal env, variant-only host overrides, token ----

  test("host agent override is detected even when variant-only (fail closed)", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir);
    await writeFile(join(cfgDir, "opencode.json"), `{"agent": {"oracle": {"variant": "max"}}}`);
    const gdir = join(root, "gdir3");
    await mkdir(gdir, { recursive: true });
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    expect(r.host.overriddenAgents).toContain("oracle");
  });

  test("environment preset value is literal, never trimmed", async () => {
    const r = await resolveConfig(projectDir, isolated({ OH_MY_OPENCODE_SLIM_PRESET: " lean " }));
    expect(r.envPreset).toBe(" lean ");
    const r2 = await resolveConfig(projectDir, isolated({ OH_MY_OPENCODE_SLIM_PRESET: "" }));
    expect(r2.envPreset).toBeNull();
  });

  test("global loader falls back to the default directory when OPENCODE_CONFIG_DIR has no config", async () => {
    const ocd = join(root, "ocd-empty");
    await mkdir(ocd, { recursive: true });
    const defaultCfgDir = join(root, "opencode"); // XDG_CONFIG_HOME=root -> default dir
    await mkdir(defaultCfgDir, { recursive: true });
    await writeFile(join(defaultCfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: ocd }));
    expect(r.global.exists).toBe(true);
    expect(r.global.path).toBe(join(defaultCfgDir, "oh-my-opencode-slim.jsonc"));
  });

  test("merged effective preset: nearest layer wins; inherited value preserved", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG); // preset: "default"
    // a deeper (nearer) layer with no preset: effective stays inherited
    const deepDir = join(root, "ws", "deep", ".opencode");
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(deepDir, "oh-my-opencode-slim.jsonc"), `{"presets": {"p": {}}}`);
    const r = await resolveConfig(join(root, "ws", "deep", "x"), isolated());
    expect(r.layers.length).toBe(2);
    expect(r.layers[0].path).toBe(join(deepDir, "oh-my-opencode-slim.jsonc"));
    expect(r.effectivePreset).toBe("default"); // inherited from the parent layer
    // nearer layer that defines preset overrides the ancestor
    await writeFile(join(deepDir, "oh-my-opencode-slim.jsonc"), `{"preset": "child", "presets": {}}`);
    const r2 = await resolveConfig(join(root, "ws", "deep", "x"), isolated());
    expect(r2.effectivePreset).toBe("child");
  });

  test("contextToken changes when any layer, host config, or environment value changes", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG);
    const gdir = join(root, "gdir4");
    await mkdir(gdir, { recursive: true });
    const r1 = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    const t1 = contextToken(r1);
    await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), CONFIG + "\n");
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir })))).not.toBe(t1);
    const r2 = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    const t2 = contextToken(r2);
    await writeFile(join(cfgDir, "opencode.json"), `{"agent": {"fixer": {"variant": "low"}}}`);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir })))).not.toBe(t2);
    const r3 = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir }));
    const t3 = contextToken(r3);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir, OH_MY_OPENCODE_SLIM_PRESET: "x" })))).not.toBe(t3);
    // env host overrides also invalidate the token
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir, OPENCODE_CONFIG_CONTENT: '{"agent":{"fixer":{"variant":"low"}}}' })))).not.toBe(t3);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_DIR: gdir, OPENCODE_CONFIG: join(root, "x.json") })))).not.toBe(t3);
  });

  // ---- verified host semantics: OPENCODE_CONFIG / OPENCODE_CONFIG_CONTENT, git boundary ----

  test("OPENCODE_CONFIG explicit file is a host override source; values never leak", async () => {
    const explicit = join(root, "explicit-host.json");
    await writeFile(
      explicit,
      `{"agent": {"fixer": {"model": "explicit/x"}}, "provider": {"p": {"apikey": "sk-EXPLICIT"}}}`,
    );
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG: explicit }));
    expect(r.host.configs.some((c) => c.path === explicit)).toBe(true);
    expect(r.host.overriddenAgents).toContain("fixer");
    const dumped = JSON.stringify(r);
    expect(dumped).not.toContain("sk-EXPLICIT");
    expect(dumped).not.toContain("explicit/x");
    // token: file content change and path change both invalidate the context
    const t1 = contextToken(r);
    await writeFile(explicit, `{"agent": {"fixer": {"model": "explicit/y"}}}`);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG: explicit })))).not.toBe(t1);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG: join(root, "other.json") })))).not.toBe(t1);
    // whitespace-only value is unset (trimmed)
    const r2 = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG: "   " }));
    expect(r2.host.env.configPath).toBeNull();
  });

  test("OPENCODE_CONFIG_CONTENT inline layer is detected, fingerprinted, and never emitted", async () => {
    const content = `{"agent": {"oracle": {"model": "inline/secret-model"}}, "provider": {"q": {"apikey": "sk-INLINE"}}}`;
    const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_CONTENT: content }));
    expect(r.host.overriddenAgents).toContain("oracle");
    const inline = r.host.configs.find((c) => c.path === "env:OPENCODE_CONFIG_CONTENT");
    expect(inline).toBeDefined();
    expect(inline!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.host.env.contentHash).toBe(inline!.hash);
    const dumped = JSON.stringify(r);
    expect(dumped).not.toContain("sk-INLINE");
    expect(dumped).not.toContain("inline/secret-model");
    // token changes when the inline value changes (whitespace-only is trimmed away)
    const t1 = contextToken(r);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_CONTENT: content + " " })))).toBe(t1);
    expect(contextToken(await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_CONTENT: content.replace("inline/", "other/") })))).not.toBe(t1);
  });

  test("malformed OPENCODE_CONFIG_CONTENT blocks verified activation without leaking", async () => {
    for (const bad of ["{ agent: ,", "[1,2]"]) {
      const r = await resolveConfig(projectDir, isolated({ OPENCODE_CONFIG_CONTENT: bad }));
      expect(r.host.diagnostics.join(" ")).toMatch(/OPENCODE_CONFIG_CONTENT unparseable; agent activation unverifiable/);
      expect(listContract(r).effective).toBe(false);
      expect(activationDiagnostics(r, "p").effective).toBe(false);
      // the raw value is still never emitted (hash only)
      expect(JSON.stringify(r)).not.toContain(bad);
    }
  });

  test("host config walk is bounded by the nearest ancestor containing .git", async () => {
    const base = join(root, "repo");
    await mkdir(join(base, "deep"), { recursive: true });
    await mkdir(join(base, ".git"));
    await mkdir(join(base, ".opencode"));
    await writeFile(join(base, ".opencode", "opencode.json"), `{"agent": {"explorer": {"model": "in/x"}}}`);
    // above the git boundary: must NOT be picked up (root is an ancestor of base
    // but outside the boundary chain; note root/.opencode is the home source and
    // always applies, so the outside fixture lives at the chain-root level)
    await writeFile(join(root, "opencode.json"), `{"agent": {"fixer": {"model": "out/x"}}}`);
    const r = await resolveConfig(join(base, "deep"), isolated({}));
    expect(r.host.configs.some((c) => c.path === join(base, ".opencode", "opencode.json"))).toBe(true);
    expect(r.host.configs.some((c) => c.path === join(root, "opencode.json"))).toBe(false);
    expect(r.host.overriddenAgents).toContain("explorer");
    expect(r.host.overriddenAgents).not.toContain("fixer");
  });

  test("host walk disable is strict 'true'; the slim walk accepts true/1 (divergence preserved)", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(join(cfgDir, "opencode.json"), `{"agent": {"oracle": {"model": "host/x"}}}`);
    // host walk: only the exact string "true" disables it
    const on = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: "1" }));
    expect(on.host.overriddenAgents).toContain("oracle");
    const off = await resolveConfig(projectDir, isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: "true" }));
    expect(off.host.overriddenAgents).not.toContain("oracle");
    // ...while the slim project walk accepts true/1 (case-insensitive)
    expect(on.disableProjectConfig).toBe(true);
    expect(off.disableProjectConfig).toBe(true);
    expect(on.active).toBeNull();
  });

  test("legacy host `agents` key entries are also detected (names only)", async () => {
    const cfgDir = join(root, "ws", ".opencode");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(join(cfgDir, "opencode.json"), `{"agents": {"council": {"model": "legacy/x"}}, "provider": {"z": {"apikey": "sk-LEGACY"}}}`);
    const r = await resolveConfig(projectDir, isolated());
    expect(r.host.overriddenAgents).toContain("council");
    expect(JSON.stringify(r)).not.toContain("sk-LEGACY");
    expect(JSON.stringify(r)).not.toContain("legacy/x");
  });

  // ---- schema mirror closure (oracle repros): fail closed on unverifiable layers ----

  describe("schema mirror rejects every construct the plugin schema rejects", () => {
    const writeLayer = async (content: string) => {
      const cfgDir = join(projectDir, ".opencode");
      await mkdir(cfgDir, { recursive: true });
      await writeFile(join(cfgDir, "oh-my-opencode-slim.jsonc"), content);
    };

    test.each([
      ["council:{} (presets required)", `{"council": {}}`],
      ["council councillor missing model", `{"council": {"presets": {"default": {"a": {}}}}}`],
      ["companion.speed out of range", `{"companion": {"speed": 99}}`],
      ["acpAgents entry missing command", `{"acpAgents": {"x": {"args": ["--x"]}}}`],
      ["acpAgents strict unknown key", `{"acpAgents": {"x": {"command": "c", "bogus": 1}}}`],
      ["unknown agent color", `{"agents": {"fixer": {"color": "red"}}}`],
      ["invalid permission action", `{"agents": {"fixer": {"permission": {"bash": "maybe"}}}}`],
      ["string-only permission key as object", `{"agents": {"fixer": {"permission": {"todowrite": {"edit": "ask"}}}}}`],
      ["fallback.enabled non-boolean", `{"fallback": {"enabled": "yes"}}`],
      ["fallback.continuationPolicy invalid", `{"fallback": {"continuationPolicy": "always"}}`],
      ["interview.outputFolder parent traversal", `{"interview": {"outputFolder": "../outside"}}`],
      ["interview.outputFolder absolute path", `{"interview": {"outputFolder": "/etc/out"}}`],
      ["noncanonical marketplace ID", `{"presets": {"p": {"marketplace": {"agents": ["Foo/Bar"]}}}}`],
      ["ambiguous preset shape", `{"presets": {"p": {"extends": "x", "agents": {}}}}`],
    ])("marks the layer schemaInvalid and activation unverifiable: %s", async (_label, content) => {
      await writeLayer(content);
      const r = await resolveConfig(projectDir, isolated());
      expect(r.project.schemaInvalid).toBe(true);
      expect(r.project.effective).toBe(false);
      expect(r.project.diagnostics.join(" ")).toMatch(/does not match the plugin schema/);
      expect(listContract(r).effective).toBe(false);
      expect(activationDiagnostics(r, "p").effective).toBe(false);
    });

    test.each(["agents", "agents_add", "agents_remove"])("rejects duplicate normalized marketplace IDs in %s", (key) => {
      const invalid = slimSchemaInvalid({ presets: { p: { marketplace: { [key]: ["author/pkg", " author/pkg "] } } } });
      expect(invalid).toBeTruthy();
    });

    test("valid constructs of the same families stay verifiable", async () => {
      await writeLayer(`{
        "council": {"presets": {"default": {"a": {"model": "prov/model"}, "b": {"model": ["prov/one", {"id": "prov/two", "variant": "max"}], "prompt": "x"}}}},
        "companion": {"speed": 1.5, "position": "bottom-left", "gifPack": "default"},
        "acpAgents": {"x": {"command": "cmd", "timeoutMs": 5, "permissionMode": "reject", "wrapperModel": "prov/m"}},
        "fallback": {"enabled": true, "maxRetries": 2, "continuationPolicy": "stick-to-fallback"},
        "interview": {"outputFolder": "out/reports"},
        "presets": {
          "p": {"marketplace": {"agents": ["author/pkg"], "agents_add": ["a.b/c-d.e"], "agents_remove": []}},
          "q": {"fixer": {"color": "#00FF00", "permission": {"bash": {"edit": "ask"}, "todowrite": "allow"}}, "designer": {"color": "primary"}}
        }
      }`);
      const r = await resolveConfig(projectDir, isolated());
      expect(r.project.schemaInvalid).toBe(false);
      expect(r.project.effective).toBe(true);
      expect(listContract(r).effective).toBe(true);
    });

    test("preset extends a missing parent: the layer still loads but activation is unverifiable", async () => {
      await writeLayer(`{"presets": {"child": {"extends": "nope", "fixer": {"model": "a/b"}}}}`);
      const r = await resolveConfig(projectDir, isolated());
      // NOT schemaInvalid: the loader loads this layer; only the preset fails to resolve
      expect(r.project.schemaInvalid).toBe(false);
      expect(r.presetExtendsBroken).toEqual(["child"]);
      const lc = listContract(r);
      expect(lc.effective).toBe(false);
      expect(lc.diagnostics.join(" ")).toMatch(/preset inheritance is broken for: child/);
      expect(activationDiagnostics(r, "child").effective).toBe(false);
    });

    test("preset extends cycle is broken; resolvable chains across layers stay verifiable", async () => {
      await writeLayer(`{"presets": {"a": {"extends": "b"}, "b": {"extends": "a"}, "c": {"fixer": {"model": "x/y"}}}}`);
      const r = await resolveConfig(projectDir, isolated());
      expect(r.presetExtendsBroken.sort()).toEqual(["a", "b"]);
      expect(listContract(r).effective).toBe(false);
      // parent defined in a farther ancestor layer resolves in the merged map
      const parentDir = join(root, "ws", ".opencode");
      await mkdir(parentDir, { recursive: true });
      await writeFile(join(parentDir, "oh-my-opencode-slim.jsonc"), `{"presets": {"base": {"fixer": {"model": "p/m"}}}}`);
      await writeLayer(`{"presets": {"child": {"extends": "base", "orchestrator": {"model": "c/m"}}}}`);
      const r2 = await resolveConfig(projectDir, isolated());
      expect(r2.presetExtendsBroken).toEqual([]);
      expect(listContract(r2).effective).toBe(true);
    });

    test("write-context enforcement refuses to proceed when the operative target is schema-invalid", async () => {
      await writeLayer(`{"fallback": {"enabled": "yes"}}`);
      const r = await resolveConfig(projectDir, isolated());
      const token = listContract(r).contextToken;
      expect(() => enforceWriteContext(r, token)).toThrow(/does not match the plugin schema/);
    });
  });

  // ---- hermeticity: resolution must never anchor outside the temp root ----
  test("all resolution paths stay inside the temp root under every env shape", async () => {
    // also covers OPENCODE_TEST_HOME: without it the host home check falls back
    // to the real homedir and would inspect the user's actual configs
    const envShapes = [
      isolated(),
      isolated({ OPENCODE_CONFIG_DIR: join(root, "gdir-iso") }),
      isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: "true" }),
      isolated({ OPENCODE_DISABLE_PROJECT_CONFIG: "1" }),
      isolated({ OH_MY_OPENCODE_SLIM_DISABLE: "1" }),
      isolated({ OPENCODE_CONFIG: join(root, "explicit.json") }),
      isolated({ OPENCODE_CONFIG_CONTENT: '{"agent":{"fixer":{"variant":"low"}}}' }),
    ];
    for (const [i, env] of envShapes.entries()) {
      const r = await resolveConfig(projectDir, env);
      assertPathsUnderRoot(root, r, `env shape ${i}`);
    }
  });
});
