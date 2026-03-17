# Contributing to snapenv

Thanks for helping. Here's what you need to know.

## Getting Started

```bash
git clone https://github.com/yourusername/snapenv.git
cd snapenv
go test ./...
go build -o snapenv
```

## What We Need

- Bug fixes (if you've hit an issue, others have too)
- Platform support (test on macOS, Linux, Windows and report what breaks)
- Feature PRs must have an issue first — open one to discuss before coding

## How to Submit a PR

1. Fork the repo, create a branch: `git checkout -b fix/your-issue`
2. Make your changes. Run `go test ./...` before pushing.
3. Submit a PR with a one-sentence description of what it does.

That's it. We're looking for working code, not perfect prose.

## Testing

Before submitting, run:
```bash
go test ./...
go vet ./...
```

If tests pass locally, they'll pass in CI.

## What I Won't Accept

- PRs that add external dependencies without discussion
- Changes to CLI output that break existing scripts
- Features with no real-world use case (ask in an issue first)

## Questions?

Open an issue. That's the fastest way to get an answer.
