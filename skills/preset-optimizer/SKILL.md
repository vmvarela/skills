---
name: preset-optimizer
description: Interactively build or edit an oh-my-opencode-slim preset by matching available OpenCode models to Epoch ECI quality and base-tier price, and validating each supported reasoning variant.
metadata:
  opencode/autoinvoke: true
---

<!-- OpenCode V2 permission example:
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [
    { "action": "skill", "resource": "*", "effect": "allow" },
    { "action": "shell", "resource": "*", "effect": "ask" },
    { "action": "webfetch", "resource": "*", "effect": "allow" },
    { "action": "edit", "resource": "*", "effect": "ask" }
  ]
}
The scripts fetch data through shell, so webfetch permission does not govern their network requests. Shell permission applies to running scripts and their host-side effects; OpenCode may remember an approval, so do not promise a separate prompt for every run. Edit permission governs native edit tools, not filesystem writes performed by an approved script.
-->

# Preset Optimizer

Build or edit an `oh-my-opencode-slim` preset using the current project model catalog and Epoch AI's ECI dataset. Scripts perform all downloads, matching, filtering, scoring, and validation; keep raw data out of the conversation and present only compact choices.

## Hard rules

- Never invent model IDs, quality scores, prices, capabilities, or reasoning variants. Use only script output and the current project-scoped OpenCode catalog.
- Never edit `oh-my-opencode-slim.jsonc` or `.json` directly. Only `scripts/write-preset.ts` may change that operational config. `fetch-data.ts` owns its cache. Send write input through stdin; do not create an agent-authored temporary JSON file.
- Always present the script's recommended choice first. Do not reorder options or promote a choice the script did not mark `recommended: true`.
- Resolve and show the operational config path before collecting agent choices. Project and ancestor project config precedence, disabled project discovery, environment-selected presets, and host-level overrides must be respected.
- Validate every selected provider/model and variant against the current project catalog immediately before writing. Never let `--force` bypass validation.
- Keep existing assignments for agents with no eligible candidate. Stop and report the unmet requirements; never relax context, capability, quality-floor, price, or variant checks silently.
- Preserve unrelated config keys and any nonempty active-preset selection. Set `config.preset` to the new name only when it is unset or empty; an environment-selected preset remains authoritative. Require a successful backup before replacing an existing file.

## Setup

Requires [Bun](https://bun.sh). Before the first run, install the declared dependencies in the skill directory: `cd <skill-base> && bun install`. The Epoch data cache is created on first use; it is never shipped with the skill.

## Step 1 — Refresh the quality cache

Use the shell tool to run `bun <skill-base>/scripts/fetch-data.ts`. `<skill-base>` is the base directory shown in this skill's injected context; use its actual path in the command. Parse the single JSON document from stdout. Use `--force` only when a fresh remote revalidation is explicitly needed; it still sends the cached ETag when available.

- Stop if stdout or stderr reports `error`, or the command exits nonzero.
- If `stale` is `true`, tell the user the cached dataset is being used and show its age. Continue only if the script reports that the cache was validated.
- A fresh cache is reused for 24 hours. After expiry, the script sends one conditional request using the cached ETag; HTTP 304 reuses the validated snapshot without downloading the ZIP again.
- Do not inspect or print the downloaded dataset.

## Step 2 — Compute candidates

Run `bun <skill-base>/scripts/compute-score.ts --top 1`. The number is the maximum candidates **per provider**, not a global limit. The script supports larger values up to 20 when explicitly requested.

The JSON output follows this complete TypeScript shape; values always come from the current scripts and catalog, never from this documentation:

```ts
type ScoreReport = {
  generatedAt: string;
  cache: { fetchedAt: string; checkedAt: string; stale: boolean };
  topPerProvider: number;
  agents: Array<{
    agent: "orchestrator" | "oracle" | "council" | "explorer" | "designer" | "fixer";
    label: string;
    bestEci: number | null;
    qualityFloor: number | null;
    options: Array<{
      provider: string;
      model: string;
      variant: string;
      eci: number;
      price: { inputPer1M: number; outputPer1M: number; effectivePer1M: number; currency: "USD" };
      context: number | null;
      vision: boolean;
      tools: boolean;
      recommended?: true;
    }>;
    excluded: Record<string, number>;
  }>;
};
```

The values above illustrate the schema, not a live recommendation. In actual output, if **any** agent has zero options, stop before asking for model choices and report that agent's failed minimum requirements and aggregate exclusion reasons. Never substitute a different metric or an unscored model.

The ranking rule is: require ECI at least `best ECI - 10`; among eligible options, sort by ascending effective base-tier price, then descending ECI, then exact model ID. Effective price per 1M tokens is `input + output × agent output weight`. It is a reference estimate, not a subscription bill. ECI measures model-level general capability, not each agent task or reasoning variant.

## Step 3 — Resolve the target preset

Before asking about models, run `bun <skill-base>/scripts/write-preset.ts --list`. Parse its compact `{path, scope, exists, presets, activePreset, effective, diagnostics, targetHash, contextToken}` result. Show the exact path, scope, existing preset names, active/effective status, and diagnostics. The resolved file is the operative target; do not ask the user to choose a different scope by default.

Ask one `question` with two options: **create new** or **edit existing**.

- For **create new**, ask for a preset name and validate it by rerunning the writer; do not silently alter the name.
- For **edit existing**, ask a second `question` listing the returned preset names. If the list is empty, stop and offer create-new instead.
- Keep the returned path and target hash/token for the later write. If the target or effective config changes during the interaction, stop and ask the user to start again with fresh results.

## Step 4 — Ask per agent

Iterate the six agents in the order returned by the script. For each, call the `question` tool once. Use the options in their existing order and put the `recommended: true` option first.

- Keep each label compact but include model, variant, ECI, and effective price. Put the full selectable `provider/model` ID plus context and vision in its description.
- State that variants are read from the current provider/model catalog and that ECI is a model-level score.
- Do not add a custom-model option unless the user asks.

## Step 5 — Write the preset

Build the JSON input in memory and pipe it to `bun <skill-base>/scripts/write-preset.ts --input -`. Use the exact target path/hash returned by `--list`; the input has this complete TypeScript shape:

```ts
type WriteInput = {
  presetName: string;
  mode: "create" | "edit";
  scope: "project" | "global";
  targetPath: string;
  targetHash: string | null;
  contextToken: string;
  agents: Partial<Record<"orchestrator" | "oracle" | "council" | "explorer" | "designer" | "fixer", {
    model: string;
    variant: string;
    price: number;
  }>>;
};
```

Include every selected agent in the actual input, setting `price` to the exact `effectivePer1M` number returned for that choice. The value is mandatory: the writer compares it to the freshly fetched catalog price. The six profiles require a supported ladder variant; the writer rechecks exact case-sensitive support, profile compatibility, and price immediately before writing. Never pass `variant: null` or invent a price.

On `{ "conflict": true }`, explain which preset already exists and ask whether to overwrite it. Rerun once with `--force` only after explicit confirmation. Validation errors, changed model/variant support, changed price, target hash conflicts, malformed config, backup failures, or I/O errors are not name conflicts: stop without `--force` or blind retry.

## Step 6 — Report

After a successful write, show a compact table with **Agent / Model / Variant / ECI / Effective price per 1M tokens**, the absolute path written, scope, and backup path (`none` for a newly created config). State that the preset is available through `/preset` only when no different `OH_MY_OPENCODE_SLIM_PRESET` override is set. After the config watcher refreshes, inference changes apply to new dispatches. Existing sessions keep their current settings; reload OpenCode if other config changes require it.

If the write result warns that `OH_MY_OPENCODE_SLIM_PRESET` selected a different preset, the written preset is not active: the environment pins the active preset and `/preset` cannot override it. Instruct the user to unset the variable (or set it to the written preset name) in the shell that launches OpenCode and then reload/re-run OpenCode. Never state that `/preset` activates the written preset while that environment override is set.

## Failure handling and data notes

- If Epoch is unavailable and no validated cache exists, stop. If a validated stale cache is used, disclose that clearly.
- Never retry parse/validation errors blindly. Invalid ZIP/CSV or JSONC must not replace the last-good cache or config.
- Report aggregate reasons for filtered models: unavailable/disabled, ambiguous or missing ECI identity, insufficient context, missing tools/text/vision, unknown price, below the ECI floor, or unsupported variant.
- Epoch ECI and its model/version mapping are sourced from [Epoch AI's published benchmark data](https://epoch.ai/data/benchmark_data.zip) and [ECI scores](https://epoch.ai/data/eci_scores.csv). Attribute Epoch AI in user-facing reports. A selected model may share a model-level ECI with provider aliases; this does not establish equal per-provider behavior.
