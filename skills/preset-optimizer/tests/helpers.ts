// SYNTHETIC test helpers and fixtures.
// Nothing here is a real Epoch snapshot or a real OpenCode catalog dump.
// Values are invented for tests only.

import { deflateSync } from "fflate";

// ---------- minimal ZIP builder (supports duplicate names / lying sizes) -----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntrySpec {
  name: string;
  data: string;
  /** override the declared uncompressed size (for bomb tests) */
  declaredSize?: number;
  deflate?: boolean;
}

export function makeZip(entries: ZipEntrySpec[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = enc.encode(e.data);
    const stored = e.deflate ? deflateSync(raw) : raw;
    const method = e.deflate ? 8 : 0;
    const declared = e.declaredSize ?? raw.length;
    const local = new Uint8Array(30 + name.length + stored.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, method, true);
    dv.setUint32(14, crc32(raw), true);
    dv.setUint32(18, stored.length, true);
    dv.setUint32(22, declared, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(stored, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, declared, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of [...locals, ...centrals, eocd]) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}

// ---------- synthetic epoch/catalog data -------------------------------------

export const ECI_CSV_ENTRY = "epoch_capabilities_index/eci_scores.csv";
export const META_CSV_ENTRY = "model_metadata.csv";

export const SYNTHETIC_ECI_CSV = `Model,Display name,eci,eci_ci_low,eci_ci_high,date
Alpha Model,Alpha Model,150.0,148,152,2026-01-01
Beta Model,Beta Model,120.0,118,122,2026-01-01
Gamma Model,Gamma Model,100.0,98,102,2026-01-01
Cheap Model,Cheap Model,95.0,93,97,2026-01-01
`;

export const SYNTHETIC_META_CSV = `model_version,model_group,date
alpha-model_high,Alpha Model,2026-01-01
alpha-model_medium,Alpha Model,2026-01-01
beta.model,Beta Model,2026-01-01
beta-model_max,Beta Model,2026-01-01
gamma-model_high,Gamma Model,2026-01-01
gamma-model_medium,Gamma Model,2026-01-01
cheap-model_low,Cheap Model,2026-01-01
cheap-model_minimal,Cheap Model,2026-01-01
`;

export function makeSyntheticZip(overrides?: Partial<Record<string, string>>): Uint8Array {
  const eci = overrides?.[ECI_CSV_ENTRY] ?? SYNTHETIC_ECI_CSV;
  const meta = overrides?.[META_CSV_ENTRY] ?? SYNTHETIC_META_CSV;
  return makeZip([
    { name: ECI_CSV_ENTRY, data: eci },
    { name: META_CSV_ENTRY, data: meta },
  ]);
}

export interface SynthModelOpts {
  id?: string;
  modelID?: string;
  providerID?: string;
  variants?: string[];
  tools?: boolean;
  input?: string[];
  context?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  enabled?: boolean;
  status?: string;
}

export function synthModel(o: SynthModelOpts = {}): Record<string, unknown> {
  const cost: unknown[] = [];
  if (o.inputPrice !== null) {
    cost.push({ input: o.inputPrice ?? 1, output: o.outputPrice ?? 2, cache: { read: 0, write: 0 } });
    cost.push({ tier: { type: "context", size: 100000 }, input: 99, output: 99, cache: { read: 0, write: 0 } });
  }
  return {
    id: o.id ?? "alpha-model",
    modelID: o.modelID ?? o.id ?? "alpha-model",
    providerID: o.providerID ?? "prov-a",
    name: "Synthetic Model",
    capabilities: { tools: o.tools ?? true, input: o.input ?? ["text", "image"], output: ["text"] },
    variants: (o.variants ?? []).map((v) => ({ id: v, settings: {} })),
    cost,
    status: o.status ?? "active",
    enabled: o.enabled ?? true,
    limit: { context: o.context ?? 200000, output: 32000 },
    settings: { baseURL: "https://secret.invalid" }, // must never leak into safe fields
    headers: { "x-secret": "s3cret" }, // must never leak into safe fields
  };
}

export function synthCatalogResponse(models: Record<string, unknown>[], directory: string): string {
  return JSON.stringify({ location: { directory }, data: models });
}

// ---------- hermetic test environment ----------------------------------------

/**
 * Isolated environment for config resolution and spawned processes: every
 * anchor the resolver or writer can consult (XDG config root, host home) is
 * pinned inside `root`, so no test can read, resolve, or create real user
 * config even when the runner's ambient HOME/XDG/OPENCODE_* variables are set.
 * Pass it explicitly into resolveConfig/writeConfig, or spread it over a
 * filtered copy of process.env for spawned processes.
 */
export function isolatedEnv(root: string, extra: Record<string, string> = {}): Record<string, string> {
  return { XDG_CONFIG_HOME: root, OPENCODE_TEST_HOME: root, ...extra };
}

/**
 * Fail a test when any config path a Resolution reports escapes the temp root:
 * covers the global/create targets, the project edit target, every merged
 * layer, and the host configs it inspected (the inline `env:` pseudo-path is
 * not a filesystem location).
 */
export function assertPathsUnderRoot(
  root: string,
  r: {
    defaultCreatePath: string;
    operative: { path: string };
    project: { path: string };
    global: { path: string };
    layers: { path: string }[];
    host: { configs: { path: string }[] };
  },
  where: string,
): void {
  const paths = [
    r.defaultCreatePath,
    r.operative.path,
    r.project.path,
    r.global.path,
    ...r.layers.map((l) => l.path),
    ...r.host.configs.map((c) => c.path).filter((p) => !p.startsWith("env:")),
  ];
  for (const p of paths) {
    if (!(p === root || p.startsWith(root + "/"))) {
      throw new Error(`test isolation (${where}): path escaped the temp root: ${p}`);
    }
  }
}
