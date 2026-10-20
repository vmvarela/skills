#!/usr/bin/env bun
// Step 3/5 entrypoint: resolve or write the operative slim preset config.
//   bun scripts/write-preset.ts --list
//   bun scripts/write-preset.ts --input - [--force]
// Single JSON document on stdout; error + exit 1 on failure (a same-name preset
// conflict is a successful `{ "conflict": true }` result, not an error).

import { resolveConfig, ConfigError } from "./lib/config.ts";
import { fetchCatalog, loadCatalogFile, isSelectable } from "./lib/catalog.ts";
import { writeConfig, type WriteInput } from "./lib/writer.ts";
import { enforceOperativeTarget, activationDiagnostics, listContract, enforceWriteContext } from "./lib/report.ts";

function emit(obj: unknown, code: number): never {
  const text = JSON.stringify(obj);
  process.stdout.write(text + "\n");
  if (code !== 0) process.stderr.write(text + "\n");
  process.exit(code);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();

  if (argv.includes("--list")) {
    emit(listContract(await resolveConfig(cwd)), 0);
  }

  if (argv.includes("--input")) {
    if (argv[argv.indexOf("--input") + 1] !== "-") emit({ error: "write-preset: pass --input - and pipe the JSON document on stdin" }, 1);
    const force = argv.includes("--force");
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(await readStdin()) as Record<string, unknown>;
    } catch (e) {
      emit({ error: `write-preset: invalid input JSON: ${(e as Error).message}` }, 1);
    }
    // fresh resolution + fresh catalog immediately before the write;
    // target/scope must still be the operative destination resolved by --list and
    // the full context (layers/env/host) must match the --list fingerprint (TOCTOU)
    const resolution = await resolveConfig(cwd);
    enforceOperativeTarget(resolution, String(input.targetPath ?? ""), String(input.scope ?? ""));
    enforceWriteContext(resolution, input.contextToken);
    // hermetic seam for tests: PRESET_OPTIMIZER_CATALOG_FILE replaces the live opencode call
    const catalog = process.env.PRESET_OPTIMIZER_CATALOG_FILE
      ? await loadCatalogFile(process.env.PRESET_OPTIMIZER_CATALOG_FILE, cwd)
      : await fetchCatalog(cwd);
    const outcome = await writeConfig(
      { ...(input as unknown as WriteInput), force, catalog: catalog.models.filter(isSelectable), effectiveActivePreset: resolution.effectivePreset },
      process.env,
    );
    if ("conflict" in outcome) emit(outcome, 0);
    // Re-resolve after writing because the writer may have initialized config.preset.
    const activation = activationDiagnostics(await resolveConfig(cwd), String(input.presetName ?? ""));
    emit({ ...outcome, ...activation }, 0);
  }

  emit({ error: "write-preset: expected --list or --input -" }, 1);
}

main().catch((e) => emit({ error: (e as Error).message }, 1));

export { ConfigError };
