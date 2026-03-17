# snapenv

Welcome to snapenv, a Go CLI tool for snapshotting and restoring environment variable sets.

## What is snapenv?

snapenv is a command-line utility written in Go that allows you to save, manage, and restore environment variable configurations. It provides a simple interface for capturing the current state of your environment variables and reloading them at a later time.

## Features

- Save environment variable snapshots with a simple command
- Load previously saved snapshots
- List all available snapshots
- Simple and easy to use
- Fast and lightweight
- Cross-platform support
- No configuration required

## Installation

To install snapenv, you need to have Go installed on your system (version 1.16 or higher).

1. Clone the repository:
```bash
git clone https://github.com/yourusername/snapenv.git
cd snapenv
```

2. Build and install:
```bash
go build -o snapenv main.go
sudo mv snapenv /usr/local/bin/
```

Or using go install:
```bash
go install github.com/yourusername/snapenv@latest
```

## Getting Started

The basic commands are:

### Save a snapshot
```bash
snapenv save myworkspace
```

### Load a snapshot
```bash
snapenv load myworkspace
```

### List snapshots
```bash
snapenv list
```

## Configuration

snapenv stores snapshots in the `~/.snapenv/` directory. No additional configuration is needed.

## Usage Examples

### Basic workflow
```bash
# Save your current environment
snapenv save work-env

# Switch to a different environment
snapenv load dev-env

# View all your saved environments
snapenv list
```

### Project-specific environments
You can save different environment configurations for each project you work on.

## Files and Directories

- Snapshots are stored in: `~/.snapenv/`
- Each snapshot is a file containing the saved environment variables

## Contributing

We welcome contributions. Please see CONTRIBUTING.md for more details.

## License

MIT

## Troubleshooting

For issues or questions, please open an issue on GitHub.

## Related Projects

Similar tools: direnv, nvm, rbenv
