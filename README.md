# skills

Most AI coding agents generate plausible code but lack *method* — they don't derive programs from specifications, and they write documentation nobody reads. This repo contains agent skills that fix both problems. Install them once and your agent writes provably correct code and concise, useful docs.

## Quick Start

```sh
npx skills add vmvarela/skills
```

That's it. All skills in this repo become available to your agent (GitHub Copilot, Claude Code, Cursor, Windsurf, and [others](https://skills.sh)).

## Skills

### [methodical-programming](skills/methodical-programming/SKILL.md)

Use this when you want your agent to *derive* correct code from formal specifications instead of guessing-and-testing. The skill teaches precondition/postcondition reasoning, structural induction over algebraic data types, recursive design with bounding functions, and loop invariant derivation. Language-agnostic — works for Python, Haskell, Java, or anything else.

Best for: algorithms, data structure operations, any function where "it works on my examples" isn't good enough.

### [pragmatic-docs](skills/pragmatic-docs/SKILL.md)

Use this when your agent writes documentation that sounds like a corporate press release or a template with 15 empty sections. Inspired by [Philip Greenspun's](https://philip.greenspun.com/) approach to software documentation: start with why the thing exists, show real examples inline, acknowledge limitations honestly, and stop writing before the reader stops reading.

Best for: READMEs, module docs, CONTRIBUTING.md, architecture docs — any Markdown that humans are supposed to actually read.

## Under the Hood

Each skill lives in `skills/<name>/SKILL.md` — a Markdown file with YAML frontmatter (`name` and `description`). The `npx skills` CLI reads this structure directly from the GitHub repo. To add a new skill, create a directory under `skills/` with a `SKILL.md` inside it. No build step, no config files, no registry.
