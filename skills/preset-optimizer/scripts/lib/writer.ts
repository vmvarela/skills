// Safe config writer: validate everything, then lock, re-check digest, exclusive
// backup, exclusive temp file, atomic rename. Any failure aborts with no target
// damage. External editors that do not take the lock can still race after the
// final digest check; that window is unavoidable and documented in the skill.
//
// Preset contract: selections are always written into config.presets[presetName],
// never into a root `agents` map or runtime overrides. An existing preset keeps
// its shape: a flat agent map, or a wrapped `{extends, agents:{...}}` preset.
// Shape discrimination follows the installed Slim 3.0.5 PresetSchema xor
// (dist/index.js): the wrapped form only when the strict
// {extends?, agents, marketplace?} definition shape matches uniquely — so a flat
// custom agent named `agents` (e.g. `{model: "provider/x"}`) is never mistaken
// for the wrapper. Selected model/variant are merged into the existing agent
// object so unrelated agent keys (temperature, skills, mcps, options, ...)
// survive. The completed document must pass the plugin schema mirror before
// backup/rename: the loader silently skips a layer whose schema fails.
//
// Active-preset policy: the file's root `preset` is set to the written name ONLY
// when nothing selected a preset anywhere (no OH_MY_OPENCODE_SLIM_PRESET
// environment value, no merged-layer selection, no file field). Any existing
// choice is preserved and reported. An environment selection pins the runtime
// preset on every config load, so activating the written preset requires
// unsetting (or changing) that variable in the shell that launches OpenCode and
// then reloading/re-running; /preset cannot override it. Backups are
// constructed at restrictive 0600; the original safe mode is applied only after
// the config write fully succeeds, and incomplete backups are cleaned up.

import { open, readFile, stat, lstat, rename, mkdir, unlink, chmod } from "node:fs/promises";
import { dirname, isAbsolute, basename } from "node:path";
import { createHash } from "node:crypto";
import { parseStrict, setJsonProperty, JsoncError } from "./jsonc.ts";
import type { CatalogModel, AgentName } from "./types.ts";
import { AGENT_ORDER, PROFILES } from "./types.ts";
import { presetShape, slimSchemaInvalid } from "./config.ts";

export const LOCK_TIMEOUT_MS = 2_000;
export const LOCK_STALE_MS = 30_000;

/** Preset names: identifier-like, 1..64 chars. */
export const PRESET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class WriteError extends Error {}

export interface Selection {
  model: string; // selectable id: provider/model
  variant: string;
  /** effective price at selection time; write aborts if the fresh price differs */
  price?: number;
}

export interface WriteInput {
  presetName: string;
  mode: "create" | "edit";
  scope: "project" | "global";
  /** librarian aliases explorer: an entry under "librarian" is written to explorer */
  agents: Partial<Record<AgentName, Selection>>;
  targetPath: string;
  /** sha256 from `--list`, or null when the file did not exist */
  targetHash: string | null;
  /** bypass ONLY the same-name preset conflict for create; never any other validation */
  force?: boolean;
  /** re-validated catalog fetched immediately before the write */
  catalog: CatalogModel[];
  /** active preset merged across config layers (environment excluded); null when nothing is set */
  effectiveActivePreset?: string | null;
}

export interface WriteResult {
  targetPath: string;
  backupPath: string | null;
  created: boolean;
  hash: string;
  warnings: string[];
  commentsPreserved: boolean;
}

export interface WriteConflict {
  conflict: true;
  presetName: string;
  targetPath: string;
  message: string;
}

export type WriteOutcome = WriteResult | WriteConflict;

/** Write every byte: FileHandle.write may complete partially, so loop until the
 * whole buffer has landed and abort when a call makes no progress. */
export async function writeAll(fh: import("node:fs/promises").FileHandle, data: string | Buffer): Promise<void> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  let written = 0;
  while (written < buf.length) {
    const { bytesWritten } = await fh.write(buf, written, buf.length - written, written);
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) {
      throw new Error(`short write: ${bytesWritten} of ${buf.length - written} bytes advanced`);
    }
    written += bytesWritten;
  }
}

async function acquireLock(lockPath: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const fh = await open(lockPath, "wx");
      await writeAll(fh, `${process.pid}\n`);
      await fh.close();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let age = 0;
      try {
        age = Date.now() - (await stat(lockPath)).mtimeMs;
      } catch {
        continue; // lock vanished; retry
      }
      if (age > LOCK_STALE_MS) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) throw new WriteError("writer: lock timeout (another writer holds the lock)");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

/** Validate a selection against a fresh catalog. Price is mandatory and must equal
 * the fresh catalog-calculated effective price; profile capabilities/context and the
 * exact supported, ladder-approved variant are verified. Never bypassed by --force. */
export function validateSelection(
  catalog: CatalogModel[],
  agent: AgentName,
  model: string,
  variant: string,
  price: unknown,
): number {
  const p = PROFILES[agent];
  const m = catalog.find((c) => c.id === model);
  if (!m) throw new WriteError(`writer: model ${model} no longer in catalog`);
  if (!m.enabled || m.status !== "active") throw new WriteError(`writer: model ${model} not enabled/active`);
  if (m.tools !== p.tools) throw new WriteError(`writer: model ${model} lacks required tools capability`);
  if (!m.inputTypes.includes("text")) throw new WriteError(`writer: model ${model} lacks text input`);
  if (p.vision && !m.inputTypes.includes("image")) throw new WriteError(`writer: model ${model} lacks vision input required for designer`);
  if (m.contextLimit === null || m.contextLimit < p.minContext) {
    throw new WriteError(`writer: model ${model} context ${m.contextLimit} below ${agent} minimum ${p.minContext}`);
  }
  // exact supported variant id (case-sensitive) and an approved ladder member
  if (!m.variants.includes(variant)) throw new WriteError(`writer: variant ${variant} not supported by ${model}`);
  if (!p.ladder.includes(variant)) throw new WriteError(`writer: variant ${variant} is not in the approved ${agent} ladder`);
  if (m.baseInput === null || m.baseOutput === null) {
    throw new WriteError(`writer: model ${model} has no valid base price`);
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new WriteError(`writer: selection price (effectivePer1M) must be a finite nonnegative number`);
  }
  const fresh = m.baseInput + m.baseOutput * p.outputWeight;
  if (price !== fresh) {
    throw new WriteError(`writer: price changed for ${model} (${price} -> ${fresh}); re-run selection`);
  }
  return fresh;
}

/** lstat that only treats ENOENT/ENOTDIR as absent; permissions/I/O errors propagate. */
export async function lstatPresent(path: string): Promise<import("node:fs").Stats | null> {
  try {
    return await lstat(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw new WriteError(`writer: cannot inspect ${path}: ${code ?? (e as Error).message}`);
  }
}


/**
 * Write per-agent model/variant selections into a slim config file.
 * All validation happens before backup; nothing mutates on failure.
 * A same-name preset conflict is returned as `{conflict:true}` (force may
 * overwrite that named preset only); every other failure throws.
 */
export async function writeConfig(input: WriteInput, env: NodeJS.ProcessEnv = process.env): Promise<WriteOutcome> {
  const warnings: string[] = [];
  const { presetName, mode, scope, targetPath, targetHash, force } = input;
  if (!PRESET_NAME_RE.test(presetName)) throw new WriteError("writer: presetName must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/");
  if (mode !== "create" && mode !== "edit") throw new WriteError("writer: mode must be create|edit");
  if (scope !== "project" && scope !== "global") throw new WriteError("writer: scope must be project|global");
  if (!isAbsolute(targetPath)) throw new WriteError("writer: targetPath must be absolute");
  if (targetHash !== null && (typeof targetHash !== "string" || !/^[a-f0-9]{64}$/.test(targetHash))) {
    throw new WriteError("writer: targetHash must be the listed SHA-256 hash or null");
  }
  if (!input.agents || typeof input.agents !== "object" || Object.keys(input.agents).length === 0) {
    throw new WriteError("writer: agents selection map must be nonempty");
  }
  for (const [agent, sel] of Object.entries(input.agents)) {
    if (!AGENT_ORDER.includes(agent as AgentName)) throw new WriteError(`writer: unknown agent ${agent}`);
    if (!sel || typeof sel.model !== "string" || !sel.model || typeof sel.variant !== "string" || !sel.variant) {
      throw new WriteError(`writer: bad selection for ${agent} (model and nonempty variant required)`);
    }
  }
  // re-validate every selection against the fresh catalog before anything else
  for (const [agent, sel] of Object.entries(input.agents)) {
    validateSelection(input.catalog, agent as AgentName, sel!.model, sel!.variant, sel!.price);
  }

  const targetStat = await lstatPresent(targetPath);
  if (targetStat?.isSymbolicLink()) throw new WriteError("writer: target is a symlink; refusing");
  if (mode === "edit" && !targetStat) throw new WriteError(`writer: target does not exist: ${targetPath}`);

  await mkdir(dirname(targetPath), { recursive: true });
  const lockPath = targetPath + ".lock";
  await acquireLock(lockPath);
  try {
    // under the lock: re-read and verify the digest immediately before mutating
    const lockedStat = await lstatPresent(targetPath);
    if (lockedStat?.isSymbolicLink()) throw new WriteError("writer: target swapped to symlink; aborting");
    const exists = lockedStat !== null;
    if (!exists && input.targetHash !== null) throw new WriteError("writer: target vanished since selection; aborting");
    if (exists && input.targetHash === null) throw new WriteError("writer: target appeared since selection (list showed no file); aborting");
    let raw = "";
    if (exists) {
      raw = await readFile(targetPath, "utf8");
      const currentHash = createHash("sha256").update(raw).digest("hex");
      if (currentHash !== input.targetHash) {
        throw new WriteError("writer: target changed since selection; aborting");
      }
    } else {
      raw = "{}"; // base document for a create
    }

    let parsed: Record<string, unknown>;
    let commentsPreserved = true;
    if (exists) {
      const p = await parseStrict(raw); // throws on syntax/duplicate keys: fail closed
      parsed = p.value as Record<string, unknown>;
      commentsPreserved = p.commentsPreserved;
      if (!commentsPreserved) {
        warnings.push("writer: fallback parser used; comments will be lost (backup created)");
      }
      const presets = parsed.presets;
      if (mode === "create" && presets && typeof presets === "object" && (presets as Record<string, unknown>)[presetName]) {
        // same-name preset conflict is the ONLY force-bypassable failure
        if (!force) {
          return {
            conflict: true,
            presetName,
            targetPath,
            message: `writer: preset "${presetName}" already exists; rerun with --force to overwrite it`,
          } satisfies WriteConflict;
        }
      }
      if (mode === "edit" && (!presets || typeof presets !== "object" || !(presets as Record<string, unknown>)[presetName])) {
        throw new WriteError(`writer: edit mode requires existing preset "${presetName}"`);
      }
    } else {
      parsed = {};
    }

    // inherited-variant safety: we always write both model and variant locally, so
    // an inherited variant can never leak; selections without a variant abort here
    for (const sel of Object.values(input.agents)) {
      if (!sel!.variant) {
        throw new WriteError("writer: selection lacks a variant; inherited variants cannot be safely neutralized (variant:null unsupported)");
      }
    }

    // perform edits inside config.presets[presetName]; merge into existing agent
    // objects (siblings like temperature/skills survive); never touch root agents
    let next = raw;
    let parsedValue = parsed;
    for (const [agent, sel] of Object.entries(input.agents) as [AgentName, Selection][]) {
      const presetObj = (parsedValue.presets as Record<string, unknown> | undefined)?.[presetName];
      // Shape discrimination per the installed Slim 3.0.5 PresetSchema xor: the
      // wrapped {extends, agents} form only when the strict definition shape
      // matches uniquely; a flat custom agent named `agents` (e.g.
      // {model: "provider/x"}) never matches that shape and stays flat.
      let wrapped: boolean;
      if (presetObj === undefined) {
        wrapped = false; // new preset (create mode) is written flat
      } else {
        const shape = presetShape(presetObj, `presets.${presetName}`);
        if (shape !== "wrapped" && shape !== "flat") {
          throw new WriteError(`writer: existing preset "${presetName}" fails the plugin schema (${shape}); aborting`);
        }
        wrapped = shape === "wrapped";
      }
      const base = wrapped ? ["presets", presetName, "agents", agent] : ["presets", presetName, agent];
      for (const [field, value] of [["model", sel.model], ["variant", sel.variant]] as const) {
        const res = await setJsonProperty(next, [...base, field], value);
        next = res.text;
        if (!res.commentsPreserved) commentsPreserved = false;
        parsedValue = (await parseStrict(next)).value as Record<string, unknown>;
      }
    }

    // Active-preset authority: environment selection (literal OH_MY_OPENCODE_SLIM_PRESET)
    // > merged config-layer selection > target file default. The file field is set
    // ONLY when no authority has selected anything; an existing/inherited choice is
    // preserved and reported, never overwritten.
    const envPreset = env.OH_MY_OPENCODE_SLIM_PRESET;
    if (typeof envPreset === "string" && envPreset !== "") {
      // the environment pins the active choice; never edit the file field under it
      if (envPreset !== presetName) {
        warnings.push(
          `writer: environment-selected preset "${envPreset}" (OH_MY_OPENCODE_SLIM_PRESET) remains the active preset; written preset "${presetName}" is not active. To activate it, unset OH_MY_OPENCODE_SLIM_PRESET (or set it to "${presetName}") in the shell that launches OpenCode, then reload/re-run OpenCode; /preset does not override the environment selection`,
        );
      }
    } else if (typeof input.effectiveActivePreset === "string" && input.effectiveActivePreset !== "") {
      // a merged lower/higher layer already selected an active preset; preserve it
      if (input.effectiveActivePreset !== presetName) {
        warnings.push(`writer: inherited active preset "${input.effectiveActivePreset}" from config layers remains active; written preset "${presetName}" is not active until selected via /preset`);
      }
    } else if (typeof parsedValue.preset === "string" && parsedValue.preset !== "") {
      if (parsedValue.preset !== presetName) {
        warnings.push(`writer: active preset "${parsedValue.preset}" left unchanged; written preset "${presetName}" is not active until selected via /preset`);
      }
    } else {
      // nothing selected anywhere (including brand-new files): set-if-unset
      const res = await setJsonProperty(next, ["preset"], presetName);
      next = res.text;
      if (!res.commentsPreserved) commentsPreserved = false;
      parsedValue = (await parseStrict(next)).value as Record<string, unknown>;
    }
    await parseStrict(next); // final sanity: result must parse
    // final schema gate BEFORE backup/rename: the loader silently skips a whole
    // layer whose schema fails, so the completed document must pass the mirror
    const schemaReason = slimSchemaInvalid(parsedValue);
    if (schemaReason) throw new WriteError(`writer: final config fails the plugin schema (${schemaReason}); aborting`);

    // backup: exclusive create with restrictive 0600 during construction; the
    // original (safe) mode is applied only AFTER the config write fully succeeds;
    // an incomplete backup is cleaned up and the write aborts before any mutation
    let backupPath: string | null = null;
    if (exists) {
      let candidate = `${targetPath}.preset-optimizer.bak`;
      let n = 1;
      let fh: import("node:fs/promises").FileHandle | null = null;
      for (;;) {
        fh = await open(candidate, "wx", 0o600).catch(() => null);
        if (fh) break;
        candidate = `${targetPath}.preset-optimizer.${n++}.bak`;
        if (n > 100) throw new WriteError("writer: cannot create exclusive backup");
      }
      try {
        await writeAll(fh!, raw);
        await fh!.sync();
        await fh!.close();
      } catch (e) {
        await fh!.close().catch(() => {});
        await unlink(candidate).catch(() => {}); // remove the incomplete backup
        throw new WriteError(`writer: backup failed, config write aborted: ${(e as Error).message}`);
      }
      backupPath = candidate;
    }

    // exclusive temp file in the same dir, fsync, atomic rename; an incomplete
    // temp file is always removed (write/sync failure included)
    const tmp = `${dirname(targetPath)}/.${basename(targetPath)}.tmp-${Math.random().toString(36).slice(2)}`;
    const fh = await open(tmp, "wx", exists ? (targetStat!.mode & 0o777) : 0o644);
    try {
      await writeAll(fh, next);
      await fh.sync();
      await fh.close();
    } catch (e) {
      await fh.close().catch(() => {});
      await unlink(tmp).catch(() => {});
      throw new WriteError(`writer: temp write failed, target untouched: ${(e as Error).message}`);
    }
    try {
      await rename(tmp, targetPath);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw new WriteError(`writer: rename failed, target untouched: ${(e as Error).message}`);
    }
    // restore the original mode on the completed backup (never wider than it);
    // a failure here leaves the backup restrictive at 0600, which is safe
    if (backupPath) {
      try {
        await chmod(backupPath, (targetStat?.mode ?? 0o644) & 0o777);
      } catch {
        warnings.push("writer: backup mode left restrictive 0600 (original mode restore failed)");
      }
    }

    return {
      targetPath,
      backupPath,
      created: !exists,
      hash: createHash("sha256").update(await readFile(targetPath)).digest("hex"),
      warnings,
      commentsPreserved,
    };
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

export { JsoncError };
