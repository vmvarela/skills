#!/usr/bin/env bun
// Step 1 entrypoint: refresh the Epoch ECI quality cache.
//   bun scripts/fetch-data.ts [--force]
// --force revalidates remotely even with a fresh cache (a conditional ETag
// request is allowed; a 304 renews the checked timestamp only).
// Single JSON document on stdout; error + exit 1 on failure.

import { refreshSummary } from "./lib/report.ts";

function emit(obj: unknown, code: number): never {
  const text = JSON.stringify(obj);
  process.stdout.write(text + "\n");
  if (code !== 0) process.stderr.write(text + "\n");
  process.exit(code);
}

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const unknown = argv.filter((a) => a !== "--force");
if (unknown.length > 0) {
  emit({ error: `fetch-data: unknown argument(s): ${unknown.join(" ")}; only --force is supported` }, 1);
}

refreshSummary({ force })
  .then((r) => emit(r, 0))
  .catch((e) => emit({ error: (e as Error).message }, 1));
