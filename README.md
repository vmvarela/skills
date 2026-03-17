# skills

Most AI coding agents generate plausible code but lack *method* — they don't derive programs from specifications, they write documentation nobody reads, and they manage projects by vibes. This repo contains agent skills that fix all three. Install them once and your agent writes provably correct code, concise useful docs, and runs your project with Scrum discipline.

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

### [github-scrum](skills/github-scrum/SKILL.md)

Use this when you want your agent to manage a software project with Scrum on GitHub. It maps Scrum artifacts to GitHub primitives — Product Backlog as Issues, Sprints as Milestones, Increments as Releases — and automates setup with `gh` CLI. Covers the full lifecycle: MVP identification, backlog creation with proper labels, sprint planning, progress tracking, reviews, and retrospectives. Adapted for solo developers and small teams (1-3 people) who don't need a Jira-sized tool to ship software.

Best for: starting new projects from scratch with an MVP, organizing work into sprints, maintaining a healthy backlog, and keeping a sustainable development cadence on GitHub.

### [github-jira](skills/github-jira/SKILL.md)

Use this when your team already uses JIRA Cloud and you want your agent to bridge it with GitHub. The JIRA ticket key (e.g. `PROJECT-123`) becomes the thread that connects branches, PRs, and releases. Includes GitHub Actions that auto-label PRs with priority and size pulled from JIRA fields, and sync GitHub Releases back to JIRA versions. Works with any JIRA project — configure it once with your domain, project key, board name, and component.

Best for: teams running Scrum in JIRA who want GitHub PRs and releases to stay in sync with tickets automatically, without manual copy-paste between tools.

## Under the Hood

Each skill lives in `skills/<name>/SKILL.md` — a Markdown file with YAML frontmatter (`name` and `description`). The `npx skills` CLI reads this structure directly from the GitHub repo. To add a new skill, create a directory under `skills/` with a `SKILL.md` inside it. No build step, no config files, no registry.
