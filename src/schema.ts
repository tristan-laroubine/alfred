import { Option } from "commander";
import { z } from "zod";

/** Names used by alfred itself, they can't be used by user commands. */
export const RESERVED_NAMES = ["init", "edit", "list", "doctor", "completion", "help", "__complete"];

export const OPTION_TYPES = ["string", "number", "boolean", "url", "path"] as const;

function isValidFlags(flags: string): boolean {
    try {
        const option = new Option(flags);
        return Boolean(option.long || option.short);
    } catch {
        return false;
    }
}

const OptionSchema = z.strictObject({
    flags: z.string().refine(isValidFlags, {
        message: 'Invalid flags, expected something like "-n, --name [name]"',
    }),
    description: z.string().default(""),
    required: z.boolean().optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
    envVar: z.string().optional(),
    choices: z.array(z.string()).optional(),
    type: z.enum(OPTION_TYPES).optional(),
});

const RawCommandSchema = z.strictObject({
    name: z.string().regex(/^[^\s-]\S*$/, {
        message: "Command name can't be empty, contain spaces or start with '-'",
    }),
    description: z.string().optional(),
    extends: z.string().optional(),
    command: z
        .strictObject({
            dir: z.string().optional(),
            cmd: z.string().optional(),
        })
        .optional(),
    config: z
        .strictObject({
            confirm: z.boolean().optional(),
        })
        .optional(),
    options: z.array(OptionSchema).optional(),
});

export const CommandsFileSchema = z.array(RawCommandSchema).superRefine((commands, ctx) => {
    const byName = new Map(commands.map((command) => [command.name, command]));
    const seen = new Set<string>();

    commands.forEach((command, index) => {
        if (RESERVED_NAMES.includes(command.name)) {
            ctx.addIssue({
                code: "custom",
                path: [index, "name"],
                message: `"${command.name}" is reserved by alfred, please rename this command`,
            });
        }
        if (seen.has(command.name)) {
            ctx.addIssue({
                code: "custom",
                path: [index, "name"],
                message: `Command "${command.name}" is defined more than once`,
            });
        }
        seen.add(command.name);

        if (command.extends === undefined) {
            if (!command.command?.cmd) {
                ctx.addIssue({
                    code: "custom",
                    path: [index, "command", "cmd"],
                    message: 'Command is required (or use "extends" to inherit one)',
                });
            }
            return;
        }
        if (!byName.has(command.extends)) {
            ctx.addIssue({
                code: "custom",
                path: [index, "extends"],
                message: `Unknown command "${command.extends}"`,
            });
            return;
        }
        // Detect extends cycles (a -> b -> a)
        const chain = [command.name];
        let parent = byName.get(command.extends);
        while (parent) {
            if (chain.includes(parent.name)) {
                ctx.addIssue({
                    code: "custom",
                    path: [index, "extends"],
                    message: `Circular "extends": ${[...chain, parent.name].join(" -> ")}`,
                });
                return;
            }
            chain.push(parent.name);
            parent = parent.extends ? byName.get(parent.extends) : undefined;
        }
    });
});

export type RawCommand = z.infer<typeof RawCommandSchema>;
export type CommandOption = z.infer<typeof OptionSchema>;

export interface AlfredCommand {
    name: string;
    description: string;
    extends?: string;
    command: {
        cmd: string;
        dir?: string;
    };
    config: {
        confirm?: boolean;
    };
    options: CommandOption[];
}

/** Name of the variable holding the option value, e.g. "--dry-run" -> "dryRun". */
export function optionAttributeName(option: CommandOption): string {
    return new Option(option.flags).attributeName();
}

/**
 * Child options override the parent ones with the same name, new ones are appended.
 */
function mergeOptions(parent: CommandOption[], child: CommandOption[]): CommandOption[] {
    const merged = new Map(parent.map((option) => [optionAttributeName(option), option]));
    for (const option of child) {
        merged.set(optionAttributeName(option), option);
    }
    return [...merged.values()];
}

/**
 * Resolve "extends" chains. Expects commands validated by CommandsFileSchema.
 */
export function resolveCommands(rawCommands: RawCommand[]): AlfredCommand[] {
    const byName = new Map(rawCommands.map((command) => [command.name, command]));
    const resolved = new Map<string, AlfredCommand>();

    function resolve(raw: RawCommand): AlfredCommand {
        const cached = resolved.get(raw.name);
        if (cached) {
            return cached;
        }
        let command: AlfredCommand;
        const parentRaw = raw.extends ? byName.get(raw.extends) : undefined;
        if (!parentRaw) {
            command = {
                name: raw.name,
                description: raw.description ?? "",
                command: { cmd: raw.command?.cmd ?? "", dir: raw.command?.dir },
                config: { ...raw.config },
                options: raw.options ?? [],
            };
        } else {
            const parent = resolve(parentRaw);
            const cmd = raw.command?.cmd
                ? raw.command.cmd.replaceAll("{super}", parent.command.cmd)
                : parent.command.cmd;
            command = {
                name: raw.name,
                description: raw.description ?? parent.description,
                extends: parent.name,
                command: { cmd, dir: raw.command?.dir ?? parent.command.dir },
                config: { ...parent.config, ...raw.config },
                options: mergeOptions(parent.options, raw.options ?? []),
            };
        }
        resolved.set(raw.name, command);
        return command;
    }

    return rawCommands.map(resolve);
}

/**
 * Non-blocking issues worth reporting in `alfred doctor`.
 */
export function lintCommands(rawCommands: RawCommand[], commands: AlfredCommand[]): string[] {
    const warnings: string[] = [];
    commands.forEach((command, index) => {
        const names = new Set(command.options.map(optionAttributeName));
        for (const [, name] of command.command.cmd.matchAll(/(?<!\$)\{(\w+)\}/g)) {
            if (name === "super") {
                continue;
            }
            if (names.has(name)) {
                warnings.push(`"${command.name}": "{${name}}" is never replaced, did you mean "\${${name}}"?`);
            }
        }
        if (!rawCommands[index]?.extends && rawCommands[index]?.command?.cmd?.includes("{super}")) {
            warnings.push(`"${command.name}": "{super}" is only replaced in commands using "extends"`);
        }
    });
    return warnings;
}
