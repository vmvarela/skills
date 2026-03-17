# snapenv

snapenv saves and restores sets of environment variables. Instead of manually hunting down and documenting environment configs across projects, you save a snapshot and load it back when you need it.

```
$ snapenv save work
Saved 12 variables to ~/.snapenv/work

$ snapenv load work
Loaded work environment (12 variables)

$ snapenv list
Available snapshots:
  work (12 variables, saved 2 hours ago)
  dev  (8 variables, saved 3 days ago)
```

## Installation

```
go install github.com/yourusername/snapenv@latest
```

or download a prebuilt binary from [Releases](https://github.com/yourusername/snapenv/releases).

## Quick Start

Save your current environment under a name:
```
snapenv save myproject
```

Load it back anytime:
```
snapenv load myproject
```

See what you've saved:
```
snapenv list
```

## How It Works

When you run `snapenv save <name>`, it stores all environment variables from your shell in `~/.snapenv/<name>` as plaintext key=value pairs. `snapenv load` sources those back into your current shell.

No config files. No magic. It just works.

## Use Cases

**Project context switching:** Save `npm-work` before switching to a Python project with different settings.

**CI/CD environments:** Document which variables are needed for a specific deploy target.

**Team onboarding:** Share a snapshot so new developers can `snapenv load onboarding` instead of reading a 20-line setup doc.

## Limitations

- Only works in the current shell session (doesn't persist across new terminals — use your shell's rc file if you need that).
- Stores variables in plaintext — don't use this for secrets. Use a proper secrets manager.
