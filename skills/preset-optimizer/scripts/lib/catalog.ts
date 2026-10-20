// Live OpenCode project-scoped model catalog with strict scope assertion and redaction.
// Only the safe field subset is ever returned or printed; raw settings/headers/body
// are never stored or emitted.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export class CatalogError extends Error {}

export interface CatalogResult {
  directory: string;
  models: import("./types.ts").CatalogModel[];
}

/** Parse "provider/model" splitting only the first slash. */
export function splitSelectableId(selectable: string): { providerID: string; id: string } {
  const i = selectable.indexOf("/");
  if (i <= 0 || i === selectable.length - 1) throw new CatalogError(`catalog: bad model id ${selectable}`);
  return { providerID: selectable.slice(0, i), id: selectable.slice(i + 1) };
}

function basePrice(cost: unknown): { input: number | null; output: number | null } {
  if (!Array.isArray(cost)) return { input: null, output: null };
  const base = cost.find((t) => t && typeof t === "object" && !("tier" in (t as object)));
  if (!base) return { input: null, output: null };
  const input = (base as Record<string, unknown>).input;
  const output = (base as Record<string, unknown>).output;
  const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return { input: fin(input), output: fin(output) };
}

function toSafeModel(m: Record<string, unknown>): import("./types.ts").CatalogModel | null {
  const providerID = m.providerID;
  const modelID = m.modelID;
  const id = m.id;
  if (typeof providerID !== "string" || typeof modelID !== "string" || typeof id !== "string") return null;
  const caps = (m.capabilities ?? {}) as Record<string, unknown>;
  const limit = (m.limit ?? {}) as Record<string, unknown>;
  const input = Array.isArray(caps.input) ? (caps.input as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const variants = Array.isArray(m.variants)
    ? (m.variants as unknown[]).map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>).id : null)).filter((v): v is string => typeof v === "string")
    : [];
  const price = basePrice(m.cost);
  const ctx = typeof limit.context === "number" && Number.isFinite(limit.context) ? limit.context : null;
  return {
    providerID,
    modelID,
    id: `${providerID}/${id}`,
    name: typeof m.name === "string" ? m.name : modelID,
    enabled: m.enabled === true,
    status: typeof m.status === "string" ? m.status : "unknown",
    tools: caps.tools === true,
    inputTypes: input,
    contextLimit: ctx,
    variants,
    baseInput: price.input,
    baseOutput: price.output,
  };
}

/** Opencode CLI command; overridable in tests. */
export function runOpenCodeApi(url: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("opencode", ["api", "get", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Shared strict parsing of a catalog payload (API stdout or local fixture file). */
function parseCatalogResponse(text: string, directory: string): CatalogResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CatalogError("catalog: unparseable response");
  }
  const loc = parsed.location as Record<string, unknown> | undefined;
  if (!loc || loc.directory !== directory) {
    throw new CatalogError(`catalog: location assertion failed (expected ${directory})`);
  }
  const raw = parsed.data;
  if (!Array.isArray(raw)) throw new CatalogError("catalog: missing data array");
  const models: import("./types.ts").CatalogModel[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const safe = toSafeModel(m as Record<string, unknown>);
    if (safe) models.push(safe);
  }
  return { directory, models };
}

/**
 * Fetch the current project-scoped catalog for `directory`.
 * Asserts response.location.directory === directory before using anything.
 */
export async function fetchCatalog(
  directory: string,
  runner: typeof runOpenCodeApi = runOpenCodeApi,
): Promise<CatalogResult> {
  const url = `/api/model?location%5Bdirectory%5D=${encodeURIComponent(directory)}`;
  const r = runner(url);
  if (r.code !== 0) throw new CatalogError(`catalog: opencode api failed (${r.code})`);
  return parseCatalogResponse(r.stdout, directory);
}

/**
 * Load a catalog from a local file with the same shape, location assertion, and
 * safe-field conversion as the API path. Hermetic seam for CLI integration
 * tests: set PRESET_OPTIMIZER_CATALOG_FILE to a fixture instead of spawning the
 * opencode binary. Never used unless the environment variable is set.
 */
export async function loadCatalogFile(path: string, directory: string): Promise<CatalogResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    throw new CatalogError(`catalog: cannot read catalog file ${path}: ${(e as Error).message}`);
  }
  return parseCatalogResponse(raw, directory);
}

/** Exclude disabled entries and unstable auto routers; keeps everything else. */
export function isSelectable(m: import("./types.ts").CatalogModel): boolean {
  return m.enabled && m.status === "active";
}
