// Shared report shapes for the documented entrypoints:
//   fetch-data.ts    -> refreshSummary
//   compute-score.ts -> scoreReport
//   write-preset.ts  -> resolveConfig (--list) + enforced write (--input -)

import { refreshCache } from "./epoch.ts";
import { fetchCatalog, isSelectable } from "./catalog.ts";
import { rankAgents } from "./match.ts";
import { resolveConfig, contextToken, type Resolution, ConfigError } from "./config.ts";
import { AGENT_ORDER, PROFILES, type AgentName, type CatalogModel } from "./types.ts";

export class ReportError extends Error {}

const LABELS: Record<AgentName, string> = {
  orchestrator: "Orchestrator",
  oracle: "Oracle",
  council: "Council",
  explorer: "Explorer",
  designer: "Designer",
  fixer: "Fixer",
};

export function defaultCachePath(): string {
  return new URL("../../cache/epoch-cache.json", import.meta.url).pathname;
}

export interface FetchSummary {
  stale: boolean;
  cacheValidated: boolean;
  fetchedAt: string;
  checkedAt: string;
  eciGroups: number;
  modelVersions: number;
  warning: string | null;
}

/** Step 1 output: refresh the Epoch cache; stale=true means the last-good cached dataset was used. */
export async function refreshSummary(opts: { cachePath?: string; force?: boolean; fetchImpl?: typeof fetch; now?: () => Date }): Promise<FetchSummary> {
  const r = await refreshCache({ cachePath: opts.cachePath ?? defaultCachePath(), force: opts.force, fetchImpl: opts.fetchImpl, now: opts.now });
  return {
    stale: r.status === "stale",
    cacheValidated: true,
    fetchedAt: r.data.fetchedAt,
    checkedAt: r.data.checkedAt,
    eciGroups: Object.keys(r.data.eci).length,
    modelVersions: Object.keys(r.data.versionToGroup).length,
    warning: r.warning ?? null,
  };
}

export interface ScoreDeps {
  cachePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  catalogImpl?: (cwd: string) => Promise<{ models: CatalogModel[] }>;
}

export interface ScoreOption {
  provider: string;
  model: string;
  variant: string;
  eci: number;
  price: { inputPer1M: number; outputPer1M: number; effectivePer1M: number; currency: "USD" };
  context: number | null;
  vision: boolean;
  tools: boolean;
  recommended?: true;
}

export interface ScoreAgent {
  agent: AgentName;
  label: string;
  bestEci: number | null;
  qualityFloor: number | null;
  options: ScoreOption[];
  excluded: Record<string, number>;
}

export interface ScoreReport {
  generatedAt: string;
  cache: { fetchedAt: string; checkedAt: string; stale: boolean };
  topPerProvider: number;
  agents: ScoreAgent[];
}

/** Step 2 output: per-agent candidates in the documented exact schema. */
export async function scoreReport(top: number, cwd: string, deps: ScoreDeps = {}): Promise<ScoreReport> {
  const epoch = await refreshCache({ cachePath: deps.cachePath ?? defaultCachePath(), fetchImpl: deps.fetchImpl, now: deps.now });
  const catalog = deps.catalogImpl
    ? await deps.catalogImpl(cwd)
    : await fetchCatalog(cwd);
  const ranked = rankAgents(epoch.data, catalog.models.filter(isSelectable), top);
  const now = deps.now ?? (() => new Date());
  const agents = AGENT_ORDER.map((agent) => {
    const r = ranked.agents[agent];
    const excluded: Record<string, number> = {};
    const add = (k: string, n: number | undefined) => {
      if (n) excluded[k] = n;
    };
    const e = r.exclusions;
    add("unmatchedQuality", (e.no_eci ?? 0) + (e.ambiguous ?? 0) + (e.quality_floor ?? 0));
    add("unsupportedVariant", e.variant_unsupported);
    add("insufficientContext", e.context);
    add("unknownPrice", e.no_price);
    add("disabledUnavailable", (e.disabled ?? 0) + (e.unstable_status ?? 0));
    add("missingTools", e.tools);
    add("missingText", e.text);
    add("missingVision", e.vision);
    return {
      agent,
      label: LABELS[agent],
      bestEci: r.bestECI,
      qualityFloor: r.qualityFloor,
      options: r.options.map((o, i) => {
        const m = catalog.models.find((c) => c.id === o.model)!;
        return {
          provider: o.model.slice(0, o.model.indexOf("/")),
          model: o.model,
          variant: o.variant,
          eci: o.eci,
          price: {
            inputPer1M: m.baseInput!,
            outputPer1M: m.baseOutput!,
            effectivePer1M: o.price,
            currency: "USD",
          },
          context: m.contextLimit,
          vision: m.inputTypes.includes("image"),
          tools: m.tools,
          ...(i === 0 ? { recommended: true } : {}),
        };
      }),
      excluded,
    };
  });
  return {
    generatedAt: now().toISOString(),
    cache: { fetchedAt: epoch.data.fetchedAt, checkedAt: epoch.data.checkedAt, stale: epoch.status === "stale" },
    topPerProvider: top,
    agents,
  };
}

/**
 * Compact documented --list contract: exact fields, names/paths only, never host values.
 */
export interface ListContract {
  path: string;
  scope: "project" | "global";
  exists: boolean;
  presets: string[];
  activePreset: string | null;
  effective: boolean;
  diagnostics: string[];
  targetHash: string | null;
  /** TOCTOU fingerprint of all layers/environment/host state; required at write time */
  contextToken: string;
}

export function listContract(resolution: Resolution): ListContract {
  const target = resolution.operative.scope === "project" ? resolution.project : resolution.global;
  // keep --list honest about the same failures activationDiagnostics reports at
  // write time: root `agents` in ANY layer shadows the preset layer, and any
  // layer skipped by the loader (malformed or schema-invalid) or dependent on
  // {env:NAME} interpolation makes activation unverifiable
  const layerDiagnostics: string[] = [];
  for (const layer of resolution.layers) {
    if (layer.rootAgentOverrides.length) {
      layerDiagnostics.push(
        `config: top-level "agents" in ${layer.path} override the active preset for: ${layer.rootAgentOverrides.join(", ")}`,
      );
    }
    if (layer.malformed) {
      layerDiagnostics.push(`config: ${layer.path} is unparseable; the loader skips it and activation cannot be verified`);
    }
    if (layer.schemaInvalid) {
      layerDiagnostics.push(`config: ${layer.path} does not match the plugin schema; the loader skips it and activation cannot be verified`);
    }
    if (layer.envVars.length) {
      layerDiagnostics.push(
        `config: ${layer.path} contains {env:NAME} interpolation for variable(s): ${layer.envVars.join(", ")}; activation cannot be verified`,
      );
    }
  }
  if (resolution.presetExtendsBroken.length) {
    layerDiagnostics.push(
      `config: preset inheritance is broken for: ${resolution.presetExtendsBroken.join(", ")} (missing parent or cycle); activation cannot be verified`,
    );
  }
  return {
    path: target.path,
    scope: target.scope,
    exists: target.exists,
    presets: target.presetNames,
    activePreset: resolution.envPreset ?? resolution.effectivePreset,
    // file-level activation: unshadowed and verifiable files, no host agent
    // overrides, no host or layer diagnostics, and all host configs verifiable;
    // the presetName-vs-activePreset check repeats at write time
    effective:
      target.effective &&
      resolution.layers.every((l) => l.rootAgentOverrides.length === 0 && !l.malformed && !l.schemaInvalid && l.envVars.length === 0) &&
      resolution.presetExtendsBroken.length === 0 &&
      resolution.host.overriddenAgents.length === 0 &&
      resolution.host.diagnostics.length === 0,
    diagnostics: [...target.diagnostics, ...layerDiagnostics, ...resolution.host.diagnostics],
    targetHash: target.hash,
    contextToken: contextToken(resolution),
  };
}

/**
 * Activation check: a written preset is effective only when the plugin is
 * active, no layer's top-level `agents` entries shadow the preset layer, no
 * layer is skipped by the loader (malformed or schema-invalid — a skipped layer
 * makes activation unverifiable), no layer depends on {env:NAME} interpolation,
 * the operative active preset (environment-selected or merged across layers)
 * equals the written name, no preset's `extends` chain is broken in the merged
 * presets map (missing parent or cycle), no host opencode.json (or
 * OPENCODE_CONFIG /
 * OPENCODE_CONFIG_CONTENT layer) agent entry overrides the same agents, and
 * every host config could be verified. Names/paths only.
 */
export function activationDiagnostics(resolution: Resolution, presetName: string): { effective: boolean; diagnostics: string[] } {
  const diagnostics: string[] = [];
  let effective = true;
  const fail = (d: string) => {
    diagnostics.push(d);
    effective = false;
  };
  if (resolution.pluginDisabled) {
    fail("config: OH_MY_OPENCODE_SLIM_DISABLE set; the plugin is inactive and no preset write will take effect");
  }
  for (const layer of resolution.layers) {
    if (layer.rootAgentOverrides.length) {
      fail(`config: top-level "agents" in ${layer.path} override the active preset for: ${layer.rootAgentOverrides.join(", ")}`);
    }
    if (layer.malformed) {
      fail(`config: ${layer.path} is unparseable; the loader skips it and activation cannot be verified until it is fixed`);
    }
    if (layer.schemaInvalid) {
      fail(`config: ${layer.path} does not match the plugin schema; the loader skips it and activation cannot be verified until it is fixed`);
    }
    if (layer.envVars.length) {
      fail(`config: ${layer.path} contains {env:NAME} interpolation for variable(s): ${layer.envVars.join(", ")}; layer values depend on the environment and activation cannot be verified`);
    }
  }
  const activePreset = resolution.envPreset ?? resolution.effectivePreset;
  if (resolution.presetExtendsBroken.length) {
    fail(
      `config: preset inheritance is broken for: ${resolution.presetExtendsBroken.join(", ")} (missing parent or cycle); the preset cannot be resolved and activation cannot be verified until it is fixed`,
    );
  }
  if (activePreset && activePreset !== presetName) {
    // recovery advice must match the actual selection mechanism: an
    // environment-selected preset is NOT changed by /preset — the variable
    // itself must be unset or changed (writer.ts reports the same)
    fail(
      resolution.envPreset
        ? `config: active preset "${activePreset}" is environment-selected via OH_MY_OPENCODE_SLIM_PRESET; written preset "${presetName}" is not active. To activate it, unset OH_MY_OPENCODE_SLIM_PRESET (or set it to "${presetName}") in the shell that launches OpenCode, then reload/re-run OpenCode; /preset does not override the environment selection`
        : `config: active preset is "${activePreset}" (from config layers); written preset "${presetName}" is not active until selected via /preset`,
    );
  }
  if (resolution.host.overriddenAgents.length) {
    fail(`config: host opencode.json agent entries are the final override for: ${resolution.host.overriddenAgents.join(", ")}`);
  }
  if (resolution.host.diagnostics.length) {
    fail("config: host config could not be fully inspected; activation is unknown until verified");
    diagnostics.push(...resolution.host.diagnostics);
  }
  return { effective, diagnostics };
}

/**
 * TOCTOU enforcement: the write input must carry the context token shown by
 * --list, and the freshly resolved context must still match it. Layer changes,
 * environment changes, or host changes since --list abort here — in addition to
 * the target file's own digest, which the writer verifies under lock.
 *
 * Also fails closed BEFORE mutation when the operative target itself is a layer
 * the loader would skip or cannot verify (malformed, schema-invalid, or
 * {env:NAME}-interpolated): writing a preset into a dead layer would be a lie.
 */
export function enforceWriteContext(resolution: Resolution, contextTokenInput: unknown): void {
  if (typeof contextTokenInput !== "string" || contextTokenInput === "") {
    throw new ReportError("write: missing contextToken; rerun the selection from a fresh --list");
  }
  if (contextTokenInput !== contextToken(resolution)) {
    throw new ReportError("write: configuration context changed since --list (config layers, environment, or host settings); rerun the selection (--list)");
  }
  const target = resolution.operative.scope === "project" ? resolution.project : resolution.global;
  if (target.exists) {
    if (target.malformed) {
      throw new ReportError("write: target config is unparseable; fix it first (the loader would skip the whole layer)");
    }
    if (target.schemaInvalid) {
      throw new ReportError("write: target config does not match the plugin schema; fix it first (the loader would skip the whole layer)");
    }
    if (target.envVars.length) {
      throw new ReportError(
        `write: target config contains {env:NAME} interpolation for variable(s): ${target.envVars.join(", ")}; its values depend on the environment and cannot be verified`,
      );
    }
  }
}

/**
 * Finding 4 enforcement: the input target/scope must be exactly the currently
 * resolved operative destination. Precedence changes since --list abort here;
 * the hash itself is verified by the writer under lock.
 */
export function enforceOperativeTarget(resolution: Resolution, targetPath: string, scope: string): void {
  const { path, scope: opScope } = resolution.operative;
  if (targetPath !== path || scope !== opScope) {
    throw new ReportError(
      `write: target ${targetPath} (${scope}) is not the currently operative destination ${path} (${opScope}); rerun --list and restart the selection`,
    );
  }
}

export { resolveConfig, ConfigError };
