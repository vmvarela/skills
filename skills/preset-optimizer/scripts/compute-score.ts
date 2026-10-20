#!/usr/bin/env bun
// Step 2 entrypoint: compute per-agent candidates.
// Usage: bun scripts/compute-score.ts [--top N]  (N = candidates per provider, 1..20, default 1)
// Single JSON document on stdout; error + exit 1 on failure.

import { scoreReport } from "./lib/report.ts";

function emit(obj: unknown, code: number): never {
  const text = JSON.stringify(obj);
  process.stdout.write(text + "\n");
  if (code !== 0) process.stderr.write(text + "\n");
  process.exit(code);
}

async function main() {
  const argv = process.argv.slice(2);
  let top = 1;
  const i = argv.indexOf("--top");
  if (i >= 0) {
    top = Number(argv[i + 1]);
  } else {
    const bare = argv.find((a) => /^\d+$/.test(a));
    if (bare !== undefined) top = Number(bare);
  }
  if (!Number.isInteger(top) || top < 1 || top > 20) {
    emit({ error: "compute-score: --top must be an integer 1..20" }, 1);
  }
  emit(await scoreReport(top, process.cwd()), 0);
}

main().catch((e) => emit({ error: (e as Error).message }, 1));
