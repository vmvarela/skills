# skills

## The Big Idea

Most code generation agents write plausible code but lack *method*: they guess at logic instead of deriving it, produce wall-of-text docs nobody reads, and manage projects by vibes. This repo fixes that. Each skill here makes your agent write correct code by construction, concise docs that people *actually* read, and run projects with clear, low-friction processes. Install once—your agent stops guessing and starts working methodically.

## Quick Start

```sh
npx skills add vmvarela/skills
```

All skills here become available to your agent instantly (Copilot, Claude, Cursor, Windsurf, and [others](https://skills.sh)).

## Skills

### [pragmatic-docs](skills/pragmatic-docs/SKILL.md)
Write documentation that respects the reader's time and actually gets read. Starts with "why," uses real examples, acknowledges trade-offs, and never pads with boilerplate. Inspired by [Philip Greenspun](https://philip.greenspun.com/). *Example*: Your README now makes the project’s why and use cases obvious in one glance.

Best for: READMEs, module docs, setup and architecture—anything meant for humans.

### [pragmatic-build](skills/pragmatic-build/SKILL.md)
Eliminate duplication, decouple code, program deliberately, and always refactor when it feels wrong. Grounded in *The Pragmatic Programmer*: Tell-Don't-Ask, crash early on the impossible, test to guide design, and never leave "broken windows". *Example*: You’ll stop making changes in four places when the requirements change in one.

Best for: Building features, fixing bugs, refactoring—any code you don’t want to fear six months later.

### [strategic-planning](skills/strategic-planning/SKILL.md)
Plan modules that are deep, information-hiding, and simple to use. Pull complexity downward, rework API designs before writing a line of implementation, and always sketch two radically different designs before you choose. Based on *A Philosophy of Software Design*. *Example*: No more pass-through wrappers—every module earns its place and simplifies the codebase.

Best for: Greenfield architecture, interface decisions, and any moment where you want future-you to thank you.

### [methodical-programming](skills/methodical-programming/SKILL.md)
Derive correct programs from formal pre/postconditions using axiomatic semantics, loop invariants, and termination proofs. Language-agnostic. *Example*: Your loop comes with an invariant and a bounding function before the first line of code.

Best for: Implementing functions that must be correct, reasoning about loops and recursion, deriving tests from postconditions.

### [create-pr](skills/create-pr/SKILL.md)
Open a pull request with a Conventional Commits title and a structured body linked to its issue. *Example*: Every PR says what, why, how it was tested, and what remains.

Best for: Teams that want consistent PR titles and bodies across repositories.

### [workspace-context](skills/workspace-context/SKILL.md)
Edit a workspace's `AGENTS.md` and `context/*.md` in the five-section format, keeping each file at most 50 lines. Requires a workspace with `AGENTS.md` and `context/`. *Example*: Repo guidance stays short, verified, and easy to scan.

Best for: Maintaining agent guidance across multiple repositories in one workspace.

### [workspace-adoption](skills/workspace-adoption/SKILL.md)
Adopt, check, update or undo this package's shared operating rules and OpenCode defaults in a workspace. It asks which components to adopt, previews every change, and never overrides your local `AGENTS.md`, context or configuration. *Example*: Your existing plugins and model routing stay as they are; only the missing defaults you approve are added.

Best for: Workspaces that already have their own rules, plugins or model routing.

### [issue-workflow-github](skills/issue-workflow-github/SKILL.md)
Triage GitHub work for a workspace: assigned issues, unlinked open pull requests, security alerts and a backlog declared in AGENTS.md, then execute a chosen issue through `create-pr`. Failed reads are reported as incomplete, never as an empty inbox. *Example*: Ask for your inbox and get up to three ranked options with reasons; nothing changes until you choose.

Best for: Teams that track work in GitHub issues across repositories under `projects/<repo>/`.

### [preset-optimizer](skills/preset-optimizer/SKILL.md)
Builds or edits an `oh-my-opencode-slim` preset by matching your OpenCode models to Epoch AI's ECI quality scores and base-tier prices, validating each reasoning variant before writing. Requires Bun (`bun install` in the skill directory); the Epoch data cache is regenerated on first use and never shipped. *Example*: Pick a cost-aware preset for each agent, with the ECI snapshot date shown and stale data flagged.

Best for: OpenCode users who route agents across models and want the choice grounded in published quality data.

## Under the Hood

Each skill lives at `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`). Add a skill = create a directory, write SKILL.md, done. No builds, configs, or magic registries.