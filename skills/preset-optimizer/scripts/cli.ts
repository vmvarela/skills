// preset-optimizer CLI. Single parseable JSON object on stdout (and stderr on
// failure); exit 0 on success, 1 on failure. Thin dispatcher over the same
// shared library the documented entrypoint scripts use.

import { resolve } from "node:path";
import { refreshSummary, scoreReport, resolveConfig, enforceOperativeTarget, activationDiagnostics, listContract, enforceWriteContext } from "./lib/report.ts";
import { fetchCatalog, loadCatalogFile, isSelectable } from "./lib/catalog.ts";
import { writeConfig, type WriteInput } from "./lib/writer.ts";

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

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const cwd = process.cwd();

  if (cmd === "epoch") {
    const sub = rest[0] ?? "refresh";
    if (sub === "status") {
      const { readCache } = await import("./lib/epoch.ts");
      const snap = await readCache(resolve(new URL("..", import.meta.url).pathname, "cache", "epoch-cache.json"));
      emit({ cache: snap ?? null }, 0);
    }
    if (sub !== "refresh") emit({ error: `unknown epoch subcommand ${sub}` }, 1);
    emit(await refreshSummary({ force: rest.includes("--force") }), 0);
  }

  if (cmd === "rank") {
    const topFlag = rest.indexOf("--top");
    let top = 1;
    if (topFlag >= 0) top = Number(rest[topFlag + 1]);
    if (!Number.isInteger(top) || top < 1 || top > 20) emit({ error: "rank: --top must be an integer 1..20" }, 1);
    emit(await scoreReport(top, cwd), 0);
  }

  if (cmd === "config") {
    const sub = rest[0] ?? "list";
    if (sub !== "list") emit({ error: `unknown config subcommand ${sub}` }, 1);
  emit(listContract(await resolveConfig(cwd)), 0);
  }

  if (cmd === "write") {
    if (!(rest.includes("--input") && rest[rest.indexOf("--input") + 1] === "-")) {
      emit({ error: "write: pass --input - and provide the JSON document on stdin" }, 1);
    }
    const force = rest.includes("--force");
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(await readStdin()) as Record<string, unknown>;
    } catch (e) {
      emit({ error: `write: invalid input JSON: ${(e as Error).message}` }, 1);
    }
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
    const activation = activationDiagnostics(await resolveConfig(cwd), String(input.presetName ?? ""));
    emit({ ...outcome, ...activation }, 0);
  }

  emit({ error: `unknown command ${cmd}; expected epoch|rank|config|write` }, 1);
}

main().catch((e) => emit({ error: (e as Error).message }, 1));
