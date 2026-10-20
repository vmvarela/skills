// Resolution of the operative oh-my-opencode-slim configuration for a cwd.
// Semantics verified against oh-my-opencode-slim 3.x as loaded by OpenCode V2
// (hostFlavor "v2"). Older plugin releases load fewer config layers, so re-verify
// against the plugin's dist/index.js (loadPluginConfig / loadMergedOpenCodeConfig)
// when the plugin version changes.
// - Slim config: ONE user config (first existing across [OPENCODE_CONFIG_DIR,
//   default dir], .jsonc preferred per dir) is the merge BASE; ALL ancestor
//   project configs (v2 flavor: filesystem-root walk) merge farthest-to-nearest;
//   nearer layers replace scalars (preset) and deep-merge objects (agents,
//   presets). A layer is SKIPPED by the loader, contributing nothing, when it is
//   malformed (bad JSON / read error) OR fails the plugin's zod schema
//   (PluginConfigSchema.safeParse) OR whose {env:NAME} interpolation breaks the
//   JSON. The raw text is BOM-stripped, comment-stripped, then
//   {env:NAME}-interpolated against process.env (missing -> "") before
//   JSON.parse; interpolation means layer values can depend on the environment.
// - Edit target vs effective layers: the plugin's project-scope write target is
//   ALWAYS the cwd's OWN `.opencode/oh-my-opencode-slim.json[c]` (created when
//   absent) — a write must never be redirected to an inherited ancestor file,
//   even though the ancestor still merges below it.
// - Host opencode config (configFiles / loadMergedOpenCodeConfig), merge order,
//   later wins: XDG config.json/opencode.json[c] > OPENCODE_CONFIG (explicit
//   file path) > git-boundary chain opencode.json[c] (root-to-nearest, only
//   when the project walk is enabled) > ~/.opencode/opencode.json[c] >
//   OPENCODE_CONFIG_DIR/opencode.json[c] > chain .opencode/opencode.json[c]
//   (root-to-nearest, only when the project walk is enabled) >
//   OPENCODE_CONFIG_CONTENT (inline JSONC, highest). The ~/.opencode and
//   OPENCODE_CONFIG_DIR sources load EVEN when OPENCODE_DISABLE_PROJECT_CONFIG
//   is the exact string "true"; only the two chain sources are gated by it
//   (strict untrimmed comparison). Host walk is bounded by the nearest
//   ancestor containing `.git` (inclusive) and is disabled only by a literal
//   case-sensitive `OPENCODE_DISABLE_PROJECT_CONFIG === "true"`.
//   Host `agent`/`agents` entries for known agents deep-merge OVER the preset
//   layer (final override). The slim walk itself uses looser true/1 semantics
//   (isProjectConfigDisabled), so the two disable checks differ by design.
// Environment selection (OH_MY_OPENCODE_SLIM_PRESET) replaces the merged
// `preset` after all layers. Per directory, .jsonc beats .json.

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { stat, lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseStrict } from "./jsonc.ts";

export const SLIM_BASENAME = "oh-my-opencode-slim";

export class ConfigError extends Error {}

export interface ScopeInfo {
  path: string;
  scope: "project" | "global";
  exists: boolean;
  preset: string | null;
  presetNames: string[];
  /** agent names present in the file's TOP-LEVEL `agents` object (overrides the active preset) */
  rootAgentOverrides: string[];
  hash: string | null;
  /** would a preset written here take effect? false when shadowed, malformed, schema-invalid OR env-interpolated */
  effective: boolean;
  /** exists but is unparseable: the loader skips the whole layer (unknown behavior) */
  malformed: boolean;
  /** parses but fails the plugin's zod config schema: the loader skips the whole layer */
  schemaInvalid: boolean;
  /** names of variables referenced via {env:NAME} interpolation (names only, never values) */
  envVars: string[];
  /** preset name -> its `extends` parent name (string directives only; names only, never values) */
  presetExtends: Record<string, string>;
  diagnostics: string[];
}

export interface Resolution {
  cwd: string;
  /** ALL merged layers, nearest first (project layers, then global if it exists) */
  layers: ScopeInfo[];
  /** project-scope EDIT target: the cwd's OWN config path (jsonc preferred), synthesized when absent */
  project: ScopeInfo;
  /** global layer (OPENCODE_CONFIG_DIR, then the default directory), or synthesized */
  global: ScopeInfo;
  /** the path a write should target when no config exists anywhere */
  defaultCreatePath: string;
  /** highest-priority existing file, or null */
  active: string | null;
  /** the operative write destination and its scope */
  operative: { path: string; scope: "project" | "global" };
  disableProjectConfig: boolean;
  /** environment-selected preset (OH_MY_OPENCODE_SLIM_PRESET); literal value, never trimmed */
  envPreset: string | null;
  /** sorted union of {env:NAME} variable names referenced across all layers (names only) */
  envInterpolatedVars: string[];
  /** sha256 over the referenced variables' resolved values ([name, value] pairs, loader semantics), or null */
  envInterpolatedValuesHash: string | null;
  /** plugin fully disabled via OH_MY_OPENCODE_SLIM_DISABLE (1/true/yes/on) */
  pluginDisabled: boolean;
  /** effective active preset merged across layers ONLY (environment value excluded) */
  effectivePreset: string | null;
  /** presets whose `extends` chain is missing a parent or cyclic in the merged presets map (names only) */
  presetExtendsBroken: string[];
  /** host opencode.json[c] agent overrides: paths+hashes and names only, never values */
  host: {
    configs: { path: string; hash: string }[];
    overriddenAgents: string[];
    diagnostics: string[];
    /** OPENCODE_CONFIG (file path) / OPENCODE_CONFIG_CONTENT (inline) presence, hashes only */
    env: { configPath: string | null; contentHash: string | null };
  };
}

function globalDir(env: NodeJS.ProcessEnv): string {
  if (env.OPENCODE_CONFIG_DIR?.trim()) return env.OPENCODE_CONFIG_DIR.trim();
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "opencode");
  return join(homedir(), ".config", "opencode");
}

function projectDisabled(env: NodeJS.ProcessEnv): boolean {
  // plugin behavior (isProjectConfigDisabled): true/1, case-insensitive, untrimmed
  const v = (env.OPENCODE_DISABLE_PROJECT_CONFIG ?? "").toLowerCase();
  return v === "true" || v === "1";
}

/** stat that distinguishes missing (null) from permission/I/O errors (throw). */
async function statPresent(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw new ConfigError(`config: cannot inspect ${path}: ${code ?? (e as Error).message}`);
  }
}

/** lstat existence without following symlinks (a worktree `.git` FILE counts). */
async function pathPresent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw new ConfigError(`config: cannot inspect ${path}: ${code ?? (e as Error).message}`);
  }
}

/** stat-isDirectory that treats missing/unreadable as false (host configDirectories semantics). */
async function dirPresent(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** .jsonc then .json fallback within one directory; null when neither exists. */
async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (await statPresent(p)) return p;
  }
  return null;
}

async function describe(path: string, scope: "project" | "global", shadowed: boolean, extraDiagnostics: string[] = []): Promise<ScopeInfo> {
  const exists = await statPresent(path);
  const diagnostics = [...extraDiagnostics];
  let preset: string | null = null;
  let presetNames: string[] = [];
  let rootAgentOverrides: string[] = [];
  let hash: string | null = null;
  let malformed = false;
  let schemaInvalid = false;
  let envVars: string[] = [];
  const presetExtends: Record<string, string> = {};
  if (exists) {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (e) {
      throw new ConfigError(`config: cannot read ${path}: ${(e as Error).message}`);
    }
    hash = createHash("sha256").update(raw).digest("hex");
    // the loader interpolates {env:NAME} -> process.env value or "" before
    // parsing, so layer values can depend on the environment; activation is
    // unverifiable then. Conservative raw-text scan: an occurrence inside a
    // comment also fails closed (safer than missing one).
    envVars = [...new Set([...raw.matchAll(/\{env:([^}]+)\}/g)].map((m) => m[1]))].sort();
    try {
      const parsed = await parseStrict(raw.replace(/^\uFEFF/, "")); // loader strips the BOM
      const v = parsed.value as Record<string, unknown>;
      const badSchema = slimSchemaInvalid(v);
      if (badSchema) {
        // PluginConfigSchema.safeParse failure: the loader silently skips the
        // whole layer, so nothing in it (preset, presets, agents) applies
        schemaInvalid = true;
        diagnostics.push(`config: config does not match the plugin schema (${badSchema}); the loader skips the whole layer`);
      } else {
        if (typeof v.preset === "string") preset = v.preset;
        if (v.presets && typeof v.presets === "object" && !Array.isArray(v.presets)) {
          presetNames = Object.keys(v.presets as object);
          // inheritance directives only; names never values (a string `extends`
          // on any valid preset shape is an inheritance directive; flat shapes
          // with a string extends fail the schema and are marked invalid above)
          for (const [name, def] of Object.entries(v.presets as Record<string, unknown>)) {
            if (isPlainObject(def) && typeof def.extends === "string" && def.extends !== "") presetExtends[name] = def.extends;
          }
        }
        // documented precedence: root `agents` overrides the active preset — names only
        if (v.agents && typeof v.agents === "object" && !Array.isArray(v.agents)) {
          rootAgentOverrides = Object.keys(v.agents as object);
          diagnostics.push(`config: top-level "agents" in ${path} override the active preset for: ${rootAgentOverrides.join(", ")}`);
        }
      }
    } catch (e) {
      // the loader skips a malformed layer entirely; its behavior is unknowable
      malformed = true;
      diagnostics.push(`config: existing file unparseable: ${(e as Error).message}`);
    }
    if (envVars.length) {
      diagnostics.push(`config: {env:NAME} interpolation present for variable(s): ${envVars.join(", ")}; layer values depend on the environment and cannot be verified`);
    }
  }
  if (shadowed) {
    diagnostics.push(`config: ${scope} file is shadowed; a preset written here will not take effect`);
  }
  const unverifiable = malformed || schemaInvalid || envVars.length > 0;
  return {
    path,
    scope,
    exists,
    preset,
    presetNames,
    rootAgentOverrides,
    hash,
    malformed,
    schemaInvalid,
    envVars,
    presetExtends,
    effective: !shadowed && !unverifiable,
    diagnostics,
  };
}

/** All ancestor slim config layers, nearest first (v2 flavor: filesystem-root walk). */
async function collectProjectLayers(cwd: string, disabled: boolean): Promise<ScopeInfo[]> {
  const layers: ScopeInfo[] = [];
  if (disabled) return layers;
  let dir = cwd;
  for (;;) {
    const found = await firstExisting([join(dir, ".opencode", `${SLIM_BASENAME}.jsonc`), join(dir, ".opencode", `${SLIM_BASENAME}.json`)]);
    if (found) {
      // non-nearest layers are lower precedence but still merged, not discarded
      const shadowed = layers.length > 0;
      layers.push(await describe(found, "project", shadowed, shadowed ? [`config: nearer project layer overrides overlapping fields of ${found}`] : []));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return layers;
}

/** Agent names the writer can select; librarian aliases explorer. */
const AGENT_NAMES = ["orchestrator", "oracle", "council", "explorer", "designer", "fixer", "librarian"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---- Minimal mirror of the plugin's config schema --------------------------
// The slim loader runs PluginConfigSchema.safeParse on EVERY slim config layer
// and silently skips a layer whose schema fails (dist/index.js
// loadRawPluginConfigFromPath), so a syntactically valid file can still be a
// dead layer. This validator mirrors RawPluginConfigSchema /
// AgentOverrideConfigSchema / PresetSchema for the constructs that can reject a
// layer or that influence preset/agent activation. Fail-closed direction: only
// constructs the host demonstrably rejects (or cannot be verified here) mark a
// layer schemaInvalid; reasons name keys/paths only, never values. Mirrors the
// loader's PRE-schema normalization: removed keys (tmux, council.master*,
// fallback.timeoutMs, multiplexer.zellij_pane_mode, backgroundJobs.*) and
// unknown disabled_hooks/disabled_commands values are stripped before the
// schema runs, so they never reject a layer (kept fail-closed here for removed
// keys). Residual gaps (marked invalid only when demonstrable): multiplexer
// details (sanitized by the loader) and non-strict sub-object unknown keys,
// which the host strips rather than rejects. Preset `extends` chains are
// resolved against the merged presets map at resolution level (see
// presetExtendsBroken); a missing parent or cycle there is reported by the
// report layer as unverifiable activation, not a skipped layer.

const AGENT_OVERRIDE_KEYS = [
  "model",
  "inheritModelFrom",
  "temperature",
  "variant", // .catch(undefined): never rejects
  "skills",
  "skills_add",
  "skills_remove",
  "skills_include_local",
  "mcps",
  "prompt",
  "orchestratorPrompt",
  "options",
  "displayName",
  "color",
  "description",
  "permission",
];

function stringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

// AGENT_THEME_COLORS mirrors the plugin's AGENT_THEME_COLORS (OpenCode theme color names).
const AGENT_THEME_COLORS = ["primary", "secondary", "accent", "success", "warning", "error", "info"];
const PERMISSION_ACTIONS = ["ask", "allow", "deny"];
// mirrors PermissionObjectSchema's superRefine: these keys must be plain actions
const STRING_ONLY_PERMISSION_KEYS = ["todowrite", "question", "webfetch", "websearch", "codesearch", "doom_loop"];
// mirrors ProviderModelIdSchema
const PROVIDER_MODEL_RE = /^[^/\s]+\/.+$/;
// mirrors the marketplace packageIdPattern (applied after the schema's trim)
const MARKETPLACE_PACKAGE_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/;
// mirrors InterviewOutputFolderSchema: relative path, no drive letter, no ".." segment
const INTERVIEW_OUTPUT_FOLDER_RE = /^(?![\\/])(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/;

function permissionInvalid(v: unknown, where: string): string | null {
  if (typeof v === "string") {
    if (!PERMISSION_ACTIONS.includes(v)) return `${where}: not ${PERMISSION_ACTIONS.map((a) => `"${a}"`).join("|")}`;
    return null;
  }
  if (!isPlainObject(v)) return `${where}: not an action or a permission object`;
  for (const [k, rule] of Object.entries(v)) {
    if (typeof rule === "string") {
      if (!PERMISSION_ACTIONS.includes(rule)) return `${where}.${k}: not ${PERMISSION_ACTIONS.map((a) => `"${a}"`).join("|")}`;
    } else if (isPlainObject(rule)) {
      for (const [k2, action] of Object.entries(rule)) {
        if (typeof action !== "string" || !PERMISSION_ACTIONS.includes(action)) {
          return `${where}.${k}.${k2}: not ${PERMISSION_ACTIONS.map((a) => `"${a}"`).join("|")}`;
        }
      }
    } else {
      return `${where}.${k}: not an action or a nested action object`;
    }
    if (STRING_ONLY_PERMISSION_KEYS.includes(k) && typeof rule !== "string") {
      return `${where}.${k}: must be a single action (${PERMISSION_ACTIONS.join("|")})`;
    }
  }
  return null;
}

/** null when the value satisfies CouncillorConfigSchema; else a reason. Unknown keys are stripped (non-strict). */
function councillorInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  const modelInvalid = (m: unknown): boolean =>
    typeof m === "string"
      ? !PROVIDER_MODEL_RE.test(m)
      : !(
          Array.isArray(m) &&
          m.length > 0 &&
          m.every(
            (e) =>
              (typeof e === "string" && PROVIDER_MODEL_RE.test(e)) ||
              (isPlainObject(e) && typeof e.id === "string" && PROVIDER_MODEL_RE.test(e.id) && (e.variant === undefined || typeof e.variant === "string")),
          )
        );
  if (modelInvalid(v.model)) return `${where}.model: required provider/model ID or a nonempty fallback chain`;
  if (v.variant !== undefined && typeof v.variant !== "string") return `${where}.variant: not a string`;
  if (v.prompt !== undefined && typeof v.prompt !== "string") return `${where}.prompt: not a string`;
  return null;
}

/** null when the value satisfies CouncilConfigSchema (passthrough; `presets` is REQUIRED). */
function councilInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  if (v.presets === undefined) return `${where}.presets: required object of councillors (each requires a model)`;
  if (!isPlainObject(v.presets)) return `${where}.presets: not an object`;
  for (const [presetName, preset] of Object.entries(v.presets)) {
    if (presetName === "master") return `${where}.presets.${presetName}: the legacy "master" preset key was removed`;
    if (!isPlainObject(preset)) return `${where}.presets.${presetName}: not an object of councillors`;
    for (const [cName, c] of Object.entries(preset)) {
      // "master"/"councillors" inside a preset are stripped by the loader before the schema
      if (cName === "master" || cName === "councillors") continue;
      const bad = councillorInvalid(c, `${where}.presets.${presetName}.${cName}`);
      if (bad) return bad;
    }
  }
  if (v.default_preset !== undefined && typeof v.default_preset !== "string") return `${where}.default_preset: not a string`;
  return null;
}

/** null when the value satisfies CompanionConfigSchema (non-strict: unknown keys are stripped). */
function companionInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  for (const [k, val] of Object.entries(v)) {
    switch (k) {
      case "enabled":
      case "debug":
        if (typeof val !== "boolean") return `${where}.${k}: not a boolean`;
        break;
      case "binaryPath":
        if (typeof val !== "string" || val.length < 1) return `${where}.${k}: not a nonempty string`;
        break;
      case "position":
        if (val !== "bottom-right" && val !== "bottom-left" && val !== "top-right" && val !== "top-left") {
          return `${where}.${k}: not "bottom-right"|"bottom-left"|"top-right"|"top-left"`;
        }
        break;
      case "size":
        if (val !== "small" && val !== "medium" && val !== "large") return `${where}.${k}: not "small"|"medium"|"large"`;
        break;
      case "gifPack":
        if (val !== "default") return `${where}.${k}: not "default"`;
        break;
      case "loopStyle":
        if (val !== "classic" && val !== "smooth") return `${where}.${k}: not "classic"|"smooth"`;
        break;
      case "speed":
        if (typeof val !== "number" || !(val >= 0.25 && val <= 4)) return `${where}.${k}: not a number in [0.25,4]`;
        break;
      default:
        break;
    }
  }
  return null;
}

/** null when the value satisfies AcpAgentConfigSchema (strict; `command` is REQUIRED). */
function acpAgentInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  if (v.command === undefined) return `${where}.command: required nonempty string`;
  for (const [k, val] of Object.entries(v)) {
    switch (k) {
      case "command":
        if (typeof val !== "string" || val.length < 1) return `${where}.command: required nonempty string`;
        break;
      case "args":
        if (!stringArray(val)) return `${where}.args: not an array of strings`;
        break;
      case "env":
        if (!isPlainObject(val) || !Object.values(val).every((x) => typeof x === "string")) {
          return `${where}.env: not an object of string values`;
        }
        break;
      case "cwd":
      case "description":
      case "prompt":
      case "orchestratorPrompt":
        if (typeof val !== "string" || val.length < 1) return `${where}.${k}: not a nonempty string`;
        break;
      case "wrapperModel":
        if (typeof val !== "string" || !PROVIDER_MODEL_RE.test(val)) return `${where}.wrapperModel: not a provider/model string`;
        break;
      case "timeoutMs":
        if (typeof val !== "number" || !Number.isInteger(val) || val < 0 || val > 2147483647) {
          return `${where}.timeoutMs: not an integer in [0,2147483647]`;
        }
        break;
      case "permissionMode":
        if (val !== "ask" && val !== "allow" && val !== "reject") return `${where}.permissionMode: not "ask"|"allow"|"reject"`;
        break;
      default:
        return `${where}: unknown key "${k}" (acpAgents entries are strict)`;
    }
  }
  return null;
}

/** null when the value satisfies AgentOverrideConfigSchema (strict); else a reason. */
function agentOverrideInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  for (const k of Object.keys(v)) {
    if (!AGENT_OVERRIDE_KEYS.includes(k)) return `${where}: unknown key "${k}" (agent overrides are strict)`;
    const val = v[k];
    switch (k) {
      case "model": {
        const ok =
          typeof val === "string" ||
          (Array.isArray(val) &&
            val.length > 0 &&
            val.every(
              (m) =>
                typeof m === "string" ||
                (isPlainObject(m) && typeof m.id === "string" && (m.variant === undefined || typeof m.variant === "string")),
            ));
        if (!ok) return `${where}.model: not a string or nonempty model list`;
        break;
      }
      case "inheritModelFrom":
        if (val !== "session" && val !== "orchestrator") return `${where}.inheritModelFrom: not "session"|"orchestrator"`;
        break;
      case "temperature":
        if (typeof val !== "number" || !(val >= 0 && val <= 2)) return `${where}.temperature: not a number in [0,2]`;
        break;
      case "skills":
      case "skills_add":
      case "skills_remove":
      case "mcps":
        if (!stringArray(val)) return `${where}.${k}: not an array of strings`;
        break;
      case "skills_include_local":
        if (typeof val !== "boolean") return `${where}.${k}: not a boolean`;
        break;
      case "prompt":
      case "orchestratorPrompt":
      case "displayName":
      case "description":
        if (typeof val !== "string" || val.length < 1) return `${where}.${k}: not a nonempty string`;
        break;
      case "options":
        if (!isPlainObject(val)) return `${where}.options: not an object`;
        break;
      case "color":
        // AgentColorSchema: #RRGGBB hex or an OpenCode theme color
        if (
          typeof val !== "string" ||
          !(/^#[0-9a-fA-F]{6}$/.test(val) || AGENT_THEME_COLORS.includes(val))
        ) {
          return `${where}.color: not a #RRGGBB hex color or theme color (${AGENT_THEME_COLORS.join("|")})`;
        }
        break;
      case "permission": {
        const bad = permissionInvalid(val, `${where}.permission`);
        if (bad) return bad;
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/** superRefine companion: orchestratorPrompt on the orchestrator agent is rejected. */
function orchestratorPromptIssue(record: Record<string, unknown>, where: string): string | null {
  const o = record.orchestrator;
  if (isPlainObject(o) && o.orchestratorPrompt !== undefined) {
    return `${where}.orchestrator: orchestratorPrompt is not supported for the orchestrator agent`;
  }
  return null;
}

function marketplaceActivationInvalid(v: unknown, where: string): string | null {
  if (!isPlainObject(v)) return `${where}: not an object`;
  for (const k of Object.keys(v)) {
    if (k !== "agents" && k !== "agents_add" && k !== "agents_remove") return `${where}: unknown key "${k}"`;
    if (!stringArray(v[k])) return `${where}.${k}: not an array of strings`;
    const ids = (v[k] as string[]).map((id) => id.trim());
    if (new Set(ids).size !== ids.length) return `${where}.${k}: duplicate package IDs`;
    // MarketplacePackageIdSchema: canonical package ID, applied to the trimmed value
    for (const id of ids) {
      if (!MARKETPLACE_PACKAGE_ID_RE.test(id)) return `${where}.${k}: not a canonical package ID such as author/name`;
    }
  }
  return null;
}

/**
 * PresetSchema is a z4.xor of {extends?, agents, marketplace?},
 * {extends (required), marketplace?, ...agentOverrides} and a flat agent map
 * (+optional marketplace). Exactly one shape must match.
 *
 * Canonical preset-shape classifier derived from the same xor computation that
 * backs presetInvalid: returns "wrapped" ({extends, agents} definition shape),
 * "flat" (inline/flat agent-map shape), or — when zero or several shapes match,
 * i.e. the loader would skip the whole layer — the reason string.
 */
export function presetShape(v: unknown, where: string): "wrapped" | "flat" | string {
  if (!isPlainObject(v)) return `${where}: not an object`;
  const shapeOk = (key: string, allowed: string[]) => allowed.includes(key);

  let defFailure: string | null = null;
  for (const k of Object.keys(v)) {
    if (!shapeOk(k, ["extends", "agents", "marketplace"])) {
      defFailure = `${where}: unknown key "${k}" for the {extends, agents} preset shape`;
      break;
    }
  }
  if (!defFailure) {
    if (!("agents" in v) || !isPlainObject(v.agents)) {
      defFailure = `${where}.agents: required object for the {extends, agents} preset shape`;
    } else if (v.extends !== undefined && (typeof v.extends !== "string" || v.extends === "")) {
      defFailure = `${where}.extends: not a nonempty string`;
    } else if (v.marketplace !== undefined && marketplaceActivationInvalid(v.marketplace, `${where}.marketplace`)) {
      defFailure = `${where}.marketplace: not a valid marketplace activation`;
    } else {
      for (const [a, ov] of Object.entries(v.agents)) {
        const bad = agentOverrideInvalid(ov, `${where}.agents.${a}`);
        if (bad) {
          defFailure = bad;
          break;
        }
      }
      if (!defFailure) defFailure = orchestratorPromptIssue(v.agents, `${where}.agents`);
    }
  }

  // body of the flat/inline shapes: every key is an agent override, marketplace
  // may also be a bare activation
  const flatBodyInvalid = (): string | null => {
    const p = orchestratorPromptIssue(v, where);
    if (p) return p;
    for (const [k, val] of Object.entries(v)) {
      if (k === "marketplace") {
        if (marketplaceActivationInvalid(val, `${where}.marketplace`) && agentOverrideInvalid(val, `${where}.marketplace`)) {
          return `${where}.marketplace: neither a marketplace activation nor an agent override`;
        }
        continue;
      }
      if (k === "extends") continue;
      const bad = agentOverrideInvalid(val, `${where}.${k}`);
      if (bad) return bad;
    }
    return null;
  };

  // inline: REQUIRES a declared nonempty-string extends + flat body
  const inlineFailure =
    typeof v.extends === "string" && v.extends !== "" ? flatBodyInvalid() : `${where}.extends: required nonempty string for the inline preset shape`;
  // flat: NO declared extends; a catchall validates the extends value as an agent override
  const flatFailure =
    v.extends === undefined ? flatBodyInvalid() : (agentOverrideInvalid(v.extends, `${where}.extends`) ?? flatBodyInvalid());

  const matches = [defFailure === null, inlineFailure === null, flatFailure === null].filter(Boolean).length;
  if (matches !== 1) return `${where}: preset shape is invalid or ambiguous (${matches} matching shapes)`;
  return defFailure === null ? "wrapped" : "flat";
}

/** null when the value satisfies PresetSchema (exactly one xor shape); else a reason. */
function presetInvalid(v: unknown, where: string): string | null {
  const shape = presetShape(v, where);
  return shape === "wrapped" || shape === "flat" ? null : shape;
}

/**
 * null when the parsed layer passes the plugin schema (a loader-skipped layer
 * contributes nothing); else a reason string naming keys/paths only.
 */
export function slimSchemaInvalid(v: unknown): string | null {
  if (!isPlainObject(v)) return "not a JSON object";
  for (const [k, val] of Object.entries(v)) {
    switch (k) {
      case "preset":
        if (typeof val !== "string") return "preset: not a string";
        break;
      case "setDefaultAgent":
      case "compactSidebar":
      case "stripOrchestratorModel":
      case "routingBlock":
      case "autoUpdate":
        if (typeof val !== "boolean") return `${k}: not a boolean`;
        break;
      case "image_routing":
        if (val !== "auto" && val !== "direct") return `image_routing: not "auto"|"direct"`;
        break;
      case "deepworkGuardMode":
        if (val !== "shadow" && val !== "enforce") return `deepworkGuardMode: not "shadow"|"enforce"`;
        break;
      case "agents": {
        if (!isPlainObject(val)) return "agents: not an object";
        for (const [name, ov] of Object.entries(val)) {
          const bad = agentOverrideInvalid(ov, `agents.${name}`);
          if (bad) return bad;
        }
        const p = orchestratorPromptIssue(val, "agents");
        if (p) return p;
        break;
      }
      case "presets": {
        if (!isPlainObject(val)) return "presets: not an object";
        for (const [name, def] of Object.entries(val)) {
          const bad = presetInvalid(def, `presets.${name}`);
          if (bad) return bad;
        }
        break;
      }
      case "disabled_agents":
      case "disabled_tools":
      case "disabled_mcps":
      case "disabled_skills":
        // loader normalization: string -> [string]; non-array -> deleted;
        // an array containing non-strings rejects the schema
        if (Array.isArray(val) && !stringArray(val)) return `${k}: array entries must be strings`;
        break;
      case "disabled_hooks":
      case "disabled_commands":
        // loader strips unknown values / deletes invalid values before the
        // schema runs, so these never reject a layer
        break;
      case "multiplexer":
        if (isPlainObject(val) && Object.hasOwn(val, "zellij_pane_mode")) return "multiplexer.zellij_pane_mode was removed; use multiplexer.*";
        break; // sanitizeMultiplexerConfig repairs every other construct
      case "backgroundJobs":
        break; // sanitizeBackgroundJobsConfig drops offending keys before the schema
      case "fallback": {
        if (!isPlainObject(val)) return "fallback: not an object";
        for (const fk of Object.keys(val)) {
          if (["timeoutMs", "retry_on_empty", "runtimeOverride"].includes(fk)) return `fallback.${fk} was removed`;
          if (!["enabled", "maxRetries", "initialRetryDelayMs", "retryDelayMs", "continuationPolicy"].includes(fk)) {
            return `fallback.${fk}: unknown key (fallback is strict)`;
          }
        }
        // FailoverConfigSchema value types (strict keys validated above)
        for (const [fk, fv] of Object.entries(val)) {
          switch (fk) {
            case "enabled":
              if (typeof fv !== "boolean") return "fallback.enabled: not a boolean";
              break;
            case "maxRetries":
            case "initialRetryDelayMs":
            case "retryDelayMs":
              if (typeof fv !== "number" || !Number.isInteger(fv) || fv < 0) return `fallback.${fk}: not an integer >= 0`;
              break;
            case "continuationPolicy":
              if (fv !== "retry-primary" && fv !== "stick-to-fallback") {
                return `fallback.continuationPolicy: not "retry-primary"|"stick-to-fallback"`;
              }
              break;
            default:
              break;
          }
        }
        break;
      }
      case "webfetch": {
        if (!isPlainObject(val)) return "webfetch: not an object";
        for (const wk of Object.keys(val)) {
          if (wk === "enabled") {
            if (typeof val.enabled !== "boolean") return "webfetch.enabled: not a boolean";
          } else if (wk === "model") {
            if (agentOverrideInvalid({ model: val[wk] }, "webfetch")) return "webfetch.model: not a string or nonempty model list";
          } else {
            return `webfetch.${wk}: unknown key (webfetch is strict)`;
          }
        }
        break;
      }
      case "interview": {
        if (!isPlainObject(val)) return "interview: not an object";
        const q = val.maxQuestions;
        if (q !== undefined && (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 10)) return "interview.maxQuestions: not an integer in [1,10]";
        // InterviewOutputFolderSchema: the regex applies to the trimmed value
        if (val.outputFolder !== undefined) {
          const o = val.outputFolder;
          if (typeof o !== "string" || o.trim().length < 1 || !INTERVIEW_OUTPUT_FOLDER_RE.test(o.trim())) {
            return "interview.outputFolder: not a relative path without parent-directory traversal";
          }
        }
        if (val.autoOpenBrowser !== undefined && typeof val.autoOpenBrowser !== "boolean") return "interview.autoOpenBrowser: not a boolean";
        const port = val.port;
        if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535)) return "interview.port: not an integer in [0,65535]";
        if (val.dashboard !== undefined && typeof val.dashboard !== "boolean") return "interview.dashboard: not a boolean";
        if (val.printState !== undefined && typeof val.printState !== "boolean") return "interview.printState: not a boolean";
        break;
      }
      case "council": {
        const bad = councilInvalid(val, "council");
        if (bad) return bad;
        break;
      }
      case "companion": {
        const bad = companionInvalid(val, "companion");
        if (bad) return bad;
        break;
      }
      case "acpAgents": {
        if (!isPlainObject(val)) return "acpAgents: not an object";
        for (const [name, a] of Object.entries(val)) {
          const bad = acpAgentInvalid(a, `acpAgents.${name}`);
          if (bad) return bad;
        }
        break;
      }
      case "tmux":
        return "tmux config was removed; use multiplexer.*";
      default:
        break; // unknown top-level keys are stripped by the schema, not rejected
    }
  }
  return null;
}

/**
 * Mirror of the plugin's preset inheritance resolution (resolvePreset runs on
 * the MERGED presets map; a missing parent or cycle throws
 * PresetResolutionError, which every consumer catches and treats as "preset
 * cannot resolve"). Returns the names of presets whose chain is broken.
 */
function brokenPresetExtends(mergedExtends: Record<string, string>, mergedNames: Set<string>): string[] {
  const broken: string[] = [];
  for (const name of Object.keys(mergedExtends)) {
    const visited = new Set<string>();
    let current: string = name;
    for (;;) {
      if (visited.has(current)) {
        broken.push(name); // cycle
        break;
      }
      visited.add(current);
      const parent = mergedExtends[current];
      if (parent === undefined) break; // chain ends: a preset without extends
      if (!mergedNames.has(parent)) {
        broken.push(name); // missing parent
        break;
      }
      current = parent;
    }
  }
  return [...new Set(broken)];
}

/** Host merge rule (mergeObjects): recursive per-key; non-object replaces. */
function mergeAgentLayer(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = mergeAgentLayer(out[k], v);
    }
    return out;
  }
  return override === undefined ? base : override;
}

/**
 * Host OpenCode config agent entries are the FINAL override for overlapping agent
 * fields: the merged host `agent`/`agents` layer deep-merges over the preset
 * layer (RuntimeConfig.agent). ANY nonempty merged entry for a known agent
 * counts as an override (fail closed: variant-only or prompt-only entries also
 * shadow the preset layer). Sources follow the verified loadMergedOpenCodeConfig
 * order above, including the OPENCODE_CONFIG file and the inline
 * OPENCODE_CONFIG_CONTENT layer.
 * Only agent names, file paths, and hashes are reported — host configs can
 * contain secrets, so values are never read into the output; the inline content
 * is fingerprinted by SHA-256 only.
 */
async function detectHostAgentOverrides(cwd: string, env: NodeJS.ProcessEnv): Promise<Resolution["host"]> {
  const configs: { path: string; hash: string }[] = [];
  const overridden = new Set<string>();
  const diagnostics: string[] = [];
  const xdg = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  const home = env.OPENCODE_TEST_HOME?.trim() || homedir();
  const configured = env.OPENCODE_CONFIG_DIR?.trim() || null;
  // host loader check is strict: only the exact lowercase string "true" (untrimmed)
  const hostProjectDisabled = env.OPENCODE_DISABLE_PROJECT_CONFIG === "true";

  // git boundary chain, project-first; no .git anywhere -> walk to the root
  const chain: string[] = [];
  if (!hostProjectDisabled) {
    let boundary: string | null = null;
    for (let dir = cwd; ; dir = dirname(dir)) {
      if (await pathPresent(join(dir, ".git"))) {
        boundary = dir;
        break;
      }
      if (dirname(dir) === dir) break;
    }
    for (let dir = cwd; ; dir = dirname(dir)) {
      chain.push(dir);
      if (dir === boundary || dirname(dir) === dir) break;
    }
  }

  // source order mirrors the host configFiles (dist/index.js): XDG global files,
  // explicit OPENCODE_CONFIG, chain opencode.json[c] (root-to-nearest, gated),
  // then the configDirectories tail — ~/.opencode and OPENCODE_CONFIG_DIR load
  // EVEN when the project walk is disabled; chain .opencode/opencode.json[c]
  // load last (project sources are the highest-precedence file sources).
  const files: string[] = [
    join(xdg, "opencode", "config.json"),
    join(xdg, "opencode", "opencode.json"),
    join(xdg, "opencode", "opencode.jsonc"),
  ];
  const explicitPath = env.OPENCODE_CONFIG?.trim() || null;
  if (explicitPath) files.push(explicitPath);
  if (!hostProjectDisabled) {
    for (let i = chain.length - 1; i >= 0; i--) {
      files.push(join(chain[i], "opencode.json"), join(chain[i], "opencode.jsonc"));
    }
  }
  // configDirectories equivalent: [XDG dir, ~/.opencode (host requires an
  // existing directory), OPENCODE_CONFIG_DIR, chain .opencode dirs] — the tail
  // loop only takes dirs ending ".opencode" or equal to OPENCODE_CONFIG_DIR
  const dirs: string[] = [join(xdg, "opencode")];
  const homeOpencode = join(home, ".opencode");
  if (await dirPresent(homeOpencode)) dirs.push(homeOpencode);
  if (configured) dirs.push(configured);
  if (!hostProjectDisabled) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const oc = join(chain[i], ".opencode");
      if (await dirPresent(oc)) dirs.push(oc);
    }
  }
  const seenDirs = new Set<string>();
  for (const d of dirs) {
    if (seenDirs.has(d)) continue;
    seenDirs.add(d);
    if (d.endsWith(".opencode") || d === configured) {
      files.push(join(d, "opencode.json"), join(d, "opencode.jsonc"));
    }
  }

  let agentLayer: unknown;
  let legacyLayer: unknown;
  for (const p of files) {
    if (!(await statPresent(p))) continue;
    let raw: string;
    try {
      raw = await readFile(p, "utf8");
    } catch (e) {
      diagnostics.push(`config: host config ${p} unreadable: ${(e as Error).message}`);
      continue;
    }
    configs.push({ path: p, hash: createHash("sha256").update(raw).digest("hex") });
    let v: unknown;
    try {
      v = (await parseStrict(raw)).value;
    } catch {
      diagnostics.push(`config: host config ${p} unparseable; agent activation unverifiable`);
      continue;
    }
    if (!isPlainObject(v)) {
      diagnostics.push(`config: host config ${p} is not a JSON object; agent activation unverifiable`);
      continue;
    }
    agentLayer = mergeAgentLayer(agentLayer, v.agent);
    legacyLayer = mergeAgentLayer(legacyLayer, v.agents);
  }

  // inline host config layer: highest precedence; hash-only fingerprint
  const content = env.OPENCODE_CONFIG_CONTENT?.trim() || null;
  if (content) {
    const contentHash = createHash("sha256").update(content).digest("hex");
    configs.push({ path: "env:OPENCODE_CONFIG_CONTENT", hash: contentHash });
    let v: unknown;
    let bad = false;
    try {
      v = (await parseStrict(content)).value;
    } catch {
      bad = true;
    }
    if (bad || !isPlainObject(v)) {
      diagnostics.push("config: host config OPENCODE_CONFIG_CONTENT unparseable; agent activation unverifiable");
    } else {
      agentLayer = mergeAgentLayer(agentLayer, v.agent);
      legacyLayer = mergeAgentLayer(legacyLayer, v.agents);
    }
  }

  for (const layer of [agentLayer, legacyLayer]) {
    if (!isPlainObject(layer)) continue;
    for (const [name, entry] of Object.entries(layer)) {
      if (AGENT_NAMES.includes(name) && isPlainObject(entry) && Object.keys(entry).length > 0) {
        overridden.add(name);
      }
    }
  }
  return {
    configs,
    overriddenAgents: [...overridden].sort(),
    diagnostics,
    env: { configPath: explicitPath, contentHash: content ? createHash("sha256").update(content).digest("hex") : null },
  };
}

function truthyOn(v: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());
}

/**
 * TOCTOU fingerprint of every layer that determines effective behavior:
 * cwd, discovery flags, environment selection, all config layer hashes, and
 * host config hashes/overrides (including OPENCODE_CONFIG and the hashed
 * OPENCODE_CONFIG_CONTENT value), plus the {env:NAME} interpolation state —
 * both the referenced variable names and a hash over their resolved values
 * (never the values themselves). Compared at write time in addition to the
 * target file's own SHA-256.
 */
export function contextToken(r: Resolution): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cwd: r.cwd,
        disableProjectConfig: r.disableProjectConfig,
        pluginDisabled: r.pluginDisabled,
        envPreset: r.envPreset,
        envInterpolation:
          r.envInterpolatedVars.length > 0
            ? { vars: r.envInterpolatedVars, valuesHash: r.envInterpolatedValuesHash }
            : null,
        layers: r.layers.map((l) => [l.path, l.hash]),
        host: {
          configs: r.host.configs.map((c) => [c.path, c.hash]),
          overriddenAgents: r.host.overriddenAgents,
          diagnostics: r.host.diagnostics,
          env: r.host.env,
        },
      }),
    )
    .digest("hex");
}

/** Resolve the full merged configuration context for `cwd` (pure, no writes). */
export async function resolveConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<Resolution> {
  // environment preset is a literal value; only an empty value means "unset"
  const envRaw = env.OH_MY_OPENCODE_SLIM_PRESET;
  const envPreset = envRaw === undefined || envRaw === "" ? null : envRaw;
  const disabled = projectDisabled(env);
  const pluginDisabled = truthyOn(env.OH_MY_OPENCODE_SLIM_DISABLE);
  // global loader: try OPENCODE_CONFIG_DIR first, then the default directory
  const defaultDir = env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, "opencode") : join(homedir(), ".config", "opencode");
  const gDir = globalDir(env); // primary global scope (OPENCODE_CONFIG_DIR is trimmed)
  const defaultCreatePath = join(gDir, `${SLIM_BASENAME}.jsonc`);

  const projectLayers = await collectProjectLayers(cwd, disabled);
  const globalPath =
    (await firstExisting([
      join(gDir, `${SLIM_BASENAME}.jsonc`), join(gDir, `${SLIM_BASENAME}.json`),
      ...(gDir === defaultDir ? [] : [join(defaultDir, `${SLIM_BASENAME}.jsonc`), join(defaultDir, `${SLIM_BASENAME}.json`)]),
    ])) ?? defaultCreatePath;

  const envDiag: string[] = [];
  if (pluginDisabled) {
    envDiag.push("config: OH_MY_OPENCODE_SLIM_DISABLE set; the plugin is inactive and no preset write will take effect");
  }
  if (envPreset) {
    envDiag.push(`config: environment-selected preset "${envPreset}" (OH_MY_OPENCODE_SLIM_PRESET) overrides any file "preset" value`);
  }
  if (env.OPENCODE_CONFIG_DIR) {
    envDiag.push(`config: OPENCODE_CONFIG_DIR=${env.OPENCODE_CONFIG_DIR} redirects global scope`);
  }

  const nearestProject = projectLayers[0] ?? null;
  const globalShadowed = (Boolean(nearestProject) && !disabled) || pluginDisabled;
  const globalExtra = [...envDiag];
  if (nearestProject && !disabled) {
    globalExtra.push(`config: project config ${nearestProject.path} overrides the global file for this cwd`);
  }
  const globalLayer = await describe(globalPath, "global", globalShadowed, globalExtra);

  const layers = [...projectLayers, ...(globalLayer.exists ? [globalLayer] : [])];
  // {env:NAME} interpolation state across layers: names only in the output;
  // the resolved values are fingerprinted (sha256) for TOCTOU, never emitted
  const envInterpolatedVars = [...new Set(layers.flatMap((l) => l.envVars))].sort();
  const envInterpolatedValuesHash = envInterpolatedVars.length
    ? createHash("sha256").update(JSON.stringify(envInterpolatedVars.map((n) => [n, env[n] ?? ""]))).digest("hex")
    : null;
  // plugin-disabled marks every layer ineffective, including existing project files
  for (const l of layers) {
    if (pluginDisabled) {
      l.effective = false;
      if (!l.diagnostics.some((d) => d.includes("plugin is inactive"))) {
        l.diagnostics.push("config: OH_MY_OPENCODE_SLIM_DISABLE set; the plugin is inactive and no preset write will take effect");
      }
    }
  }
  // effective active preset across merged layers only (environment value excluded):
  // nearest layer that defines `preset` wins; malformed layers are skipped by the
  // loader (preset stays null), so the find naturally ignores them
  const effectivePreset = layers.find((l) => typeof l.preset === "string" && l.preset !== "")?.preset ?? null;

  // Preset inheritance resolution over the merged presets map the loader
  // resolves against: only layers the loader actually loads contribute
  // (malformed/schema-invalid layers contribute nothing); farthest-to-nearest,
  // nearer definitions win for the same name
  const mergedExtends: Record<string, string> = {};
  const mergedPresetNames = new Set<string>();
  for (const l of [...layers].reverse()) {
    if (!l.exists || l.malformed || l.schemaInvalid) continue;
    Object.assign(mergedExtends, l.presetExtends);
    for (const n of l.presetNames) mergedPresetNames.add(n);
  }
  const presetExtendsBroken = brokenPresetExtends(mergedExtends, mergedPresetNames);

  // project-scope EDIT target: the cwd's OWN file (the plugin never redirects
  // project writes to an inherited ancestor), .jsonc preferred, created when absent
  const projectEditPath =
    (await firstExisting([join(cwd, ".opencode", `${SLIM_BASENAME}.jsonc`), join(cwd, ".opencode", `${SLIM_BASENAME}.json`)]))
    ?? join(cwd, ".opencode", `${SLIM_BASENAME}.jsonc`);
  const projectExtra = [...envDiag];
  if (nearestProject && nearestProject.path !== projectEditPath) {
    projectExtra.push(`config: inherited project layer ${nearestProject.path} merges below ${projectEditPath}; writing here creates the nearest layer`);
  }
  const project =
    nearestProject && nearestProject.path === projectEditPath
      ? nearestProject
      : await describe(projectEditPath, "project", disabled || pluginDisabled, projectExtra);
  project.effective = !(disabled || pluginDisabled) && !project.malformed && !project.schemaInvalid && project.envVars.length === 0;
  for (const d of projectExtra) if (!project.diagnostics.includes(d)) project.diagnostics.push(d);

  for (const s of [project, globalLayer]) {
    if (envPreset && s.preset && s.preset !== envPreset) {
      s.diagnostics.push(`config: environment-selected preset "${envPreset}" (OH_MY_OPENCODE_SLIM_PRESET) overrides the file's "preset": "${s.preset}"`);
    }
  }

  const host = await detectHostAgentOverrides(cwd, env);

  const active = layers[0]?.path ?? null;
  // operative destination: global when the project walk is disabled or no
  // project config exists anywhere (skill contract); otherwise the cwd's own
  // project file is the edit target even when an inherited ancestor exists
  const operative = disabled || !nearestProject
    ? { path: globalPath, scope: "global" as const }
    : { path: projectEditPath, scope: "project" as const };
  return { cwd, layers, project, global: globalLayer, defaultCreatePath, active, operative, disableProjectConfig: disabled, envPreset, pluginDisabled, effectivePreset, presetExtendsBroken, envInterpolatedVars, envInterpolatedValuesHash, host };
}
