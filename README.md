# alfred
The butler for the CLI


## Limitations
- Currently only supports MacOS
- Only supports .zprofile for now

## Getting Started
1. Clone the repository
2. Run `bun install`
3. Create commands.json in the root directory :
`echo "[]" > commands.json`
4. Run `bun compile`
5. Try running `alfred` in the terminal (e.g `alfred hello`)

## Command Schema

### AlfredCommandSchema
The schema for an Alfred command is as follows:
```typescript
interface AlfredCommandSchema {
    name: string; // The name of the command
    description: string; // A brief description of the command
    command: {
        dir?: string; // Optional directory where the command should be executed
        cmd: string; // The command to execute
    };
    config?: {
        confirm?: boolean; // Optional flag to require confirmation before execution
    };
    extends?: string; // Optional name of a command to extend
    options?: {
        flags: string; // Command line flags (e.g., "-n, --name [name]")
        description: string; // Description of what the option does
        required?: boolean; // Whether the option is required
        defaultValue?: any; // Default value for the option
        envVar?: string; // Environment variable to use for the option
        choices?: string[]; // Array of string choices for the option
        type?: "number" | "string" | "boolean" | "url" | "path"; // Type of the option
    }[];
}
```
## Examples
### Example 1: Basic Command
```json
{
    "name": "hello",
    "description": "Prints hello world",
    "command": {
        "cmd": "echo 'Hello, World!'"
    }
}
```

### Example 2: Command with Options

```json
{
    "name": "greet",
    "description": "Greets the user",
    "command": {
        "cmd": "echo 'Hello, ${name}!'"
    },
    "options": [
        {
            "flags": "--name [name]",
            "description": "Name of the user",
            "type": "string",
            "defaultValue": "User"
        }
    ]
}
```

### Example 3: Extending a Command
```json
{
    "name": "list",
    "description": "List files",
    "command": {
        "cmd": "ls"
    }
},
{    "name": "list:all",
    "extends": "list",
    "command": {
        "cmd": "{super} -a"
    }
}
```
An extended command doesn't need to redefine commands, and can simply redefine options.

## Options
- flags: Command line flags (e.g., --name [name]).
- description: Description of the option.
- required: Whether the option is required.
- defaultValue: Default value for the option.
- envVar: Environment variable for the option.
- choices: Array of string choices.
- type: Type of the option (number, string, boolean, url, path).

## Configuration
- confirm: Whether confirmation is needed before executing the command.

