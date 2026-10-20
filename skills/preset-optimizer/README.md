# preset-optimizer

Builds or edits an `oh-my-opencode-slim` preset by matching the models available in your OpenCode project to Epoch AI's ECI quality scores and base-tier prices. Agent instructions live in `SKILL.md`; this file covers setup and maintenance.

## Setup

```sh
cd <skill-directory>
bun install
bun test tests/
```

Requires Bun. Dependencies are declared in `package.json` and locked in `bun.lock`.

## Data and staleness

- The Epoch ECI snapshot is cached in `cache/epoch-cache.json`. It is generated, not committed; `.gitignore` excludes it.
- The cache records `fetchedAt` (the date the data was downloaded) and `checkedAt` (the last successful revalidation). Score reports include both, and `stale: true` means the latest download failed and the last good snapshot is in use.
- Prices are read live from the OpenCode project catalog on every run, not from the cache.

Refresh the snapshot explicitly:

```sh
bun scripts/fetch-data.ts          # reuses a cache younger than 24 hours
bun scripts/fetch-data.ts --force  # always revalidates with the remote
```

## Attribution

Quality data comes from [Epoch AI](https://epoch.ai/data/benchmark_data.zip) and its [ECI scores](https://epoch.ai/data/eci_scores.csv). Keep that attribution in user-facing reports.
