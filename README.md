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

## Under the Hood

Each skill lives at `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`). Add a skill = create a directory, write SKILL.md, done. No builds, configs, or magic registries.