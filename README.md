# 🤖 Alfred

The butler for your CLI: describe your frequent shell commands once in a JSON file, then run them from anywhere with `alfred <name>`, or pick them from a searchable menu with `alfred`.

```console
$ alfred
? Which command? stage
❯ cloud:stage        Serve the cloud app in stage mode
  mobi:stage         Serve the mobile app
  ~/Developer/app $ ./run.sh cloud --stage
```

## Install

### Homebrew (macOS, Linux)

```sh
brew install tristan-laroubine/tap/allfy
```

### Install script (no dependency)

```sh
curl -fsSL https://raw.githubusercontent.com/tristan-laroubine/alfred/main/install.sh | sh
```

The binary goes to `~/.local/bin` (change it with `ALFRED_INSTALL_DIR`, pick a version with `ALFRED_VERSION=0.8.0`).

### npm (Node.js ≥ 22.12)

```sh
npm install -g allfy
```

Then run `alfred init`: it creates your commands file and enables shell completion (zsh, bash, fish).

## Your commands

They live in `~/.config/alfred/commands.json`, `alfred edit` opens it in `$VISUAL` / `$EDITOR`.
To share them between computers, keep this file in your dotfiles, or point `ALFRED_COMMANDS` to another path (e.g. in iCloud Drive):

```sh
export ALFRED_COMMANDS="$HOME/Library/Mobile Documents/com~apple~CloudDocs/alfred/commands.json"
```

### Basic command

```json
[
    {
        "name": "hello",
        "description": "Prints hello world",
        "command": {
            "cmd": "echo 'Hello, World!'"
        }
    }
]
```

Commands run with `bash`, attached to your terminal: colors, prompts and Ctrl+C work as usual, and `alfred` exits with the command's exit code.

| Field | Description |
| --- | --- |
| `name` | Name of the command, e.g. `git:empty-commit` (no spaces) |
| `description` | Shown in the menu, the help and the completion |
| `command.cmd` | The bash script to run |
| `command.dir` | Optional directory to run it in (`~` is supported) |
| `config.confirm` | Ask for a confirmation before running it (skip it with `--yes`) |
| `extends` | Name of a command to inherit from, see below |
| `options` | Command line options, see below |

### Options

```json
{
    "name": "greet",
    "description": "Greets someone",
    "command": {
        "cmd": "echo \"Hello, ${name}!\""
    },
    "options": [
        {
            "flags": "-n, --name [name]",
            "description": "Who to greet",
            "defaultValue": "World"
        }
    ]
}
```

```sh
alfred greet --name Bob   # Hello, Bob!
```

Each option is available in the command as a bash variable named after its long flag in camelCase (`--dry-run` → `${dryRun}`), empty when the option is not given. Values are never re-interpreted as shell code, quote them as usual (`"${name}"`).

| Field | Description |
| --- | --- |
| `flags` | `--name <value>` (value required), `--name [value]` (value optional), `--force` (boolean flag), with an optional short flag: `-n, --name [value]` |
| `description` | Help text |
| `required` | The option must be given |
| `defaultValue` | Value used when the option is missing (or given without value) |
| `envVar` | Environment variable used when the option is missing |
| `choices` | Allowed values, e.g. `["stage", "prod"]` |
| `type` | `string` (default), `number`, `boolean`, `url` (validated) or `path` (made absolute, `~` supported) |

When a command is picked from the menu, alfred asks for each option value.

Other arguments are available as `"$@"`, `$1`…: with `"cmd": "git log \"$@\""`, `alfred log -- --oneline -5` runs `git log --oneline -5`.

### Extending a command

```json
[
    {
        "name": "list",
        "description": "List files",
        "command": {
            "cmd": "ls"
        }
    },
    {
        "name": "list:all",
        "extends": "list",
        "description": "List all files",
        "command": {
            "cmd": "{super} -a"
        }
    }
]
```

An extended command inherits everything from its parent: `{super}` is replaced by the parent command, options with the same name are overridden and new ones are added.

## Built-in commands

| Command | Description |
| --- | --- |
| `alfred` | Pick a command in a searchable menu |
| `alfred list [--json]` | List your commands |
| `alfred edit [--path]` | Edit your commands file, checks it when the editor closes |
| `alfred init [shell]` | Create the commands file and enable shell completion |
| `alfred doctor` | Check your setup and your commands file |
| `alfred completion [shell]` | Print the completion script, e.g. `eval "$(alfred completion zsh)"` |

## Upgrading from 0.7

- The commands file moves automatically from `~/Library/Caches/allfy-nodejs/` (which macOS may clear) to `~/.config/alfred/`, a link is left at the old location.
- The completion no longer uses tabtab: run `alfred init` to switch to the new one, it removes the old one.
- `${HOME}` and other variables are no longer removed from commands, and `{name}` (without `$`) has never been replaced: `alfred doctor` points it out.
- The `npm` package no longer needs Bun and no longer compiles anything when installed.

## Development

```sh
bun install
bun run dev -- list       # run from the sources
bun test
bun run typecheck
bun run compile           # standalone binary in dist/alfred
```

### Releasing

1. Bump `version` in `package.json` and commit.
2. Push a matching tag: `git tag v0.8.0 && git push origin v0.8.0`.

The [release workflow](.github/workflows/release.yml) then builds the binaries (macOS and Linux, arm64 and x64), creates the GitHub release, updates the Homebrew formula in [tristan-laroubine/homebrew-tap](https://github.com/tristan-laroubine/homebrew-tap) (needs the `HOMEBREW_TAP_TOKEN` secret) and publishes to npm (needs the `NPM_TOKEN` secret).
