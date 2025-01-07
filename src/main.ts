import { Command } from "commander";
import autocomplete from "inquirer-autocomplete-standalone";
import alfredCommands from "../commands.json";
import { $, cd, os } from "zx";
import z from "zod";
import chalk from "chalk";
import { merge } from "lodash";
$.verbose = true;
const AlfredCommandSchema = z.object({
    name: z.string().min(1, { message: "Command Name is required" }),
    description: z.string(),
    command: z.object({
        dir: z.string().optional(),
        cmd: z.string().min(1, { message: "Command is required" }),
    }),
    config: z
        .object({
            confirm: z.boolean().optional(),
        })
        .optional(),
    extends: z.string().optional(),
    options: z
        .array(
            z.object({
                flags: z.string(),
                description: z.string(),
                required: z.boolean().optional(),
                defaultValue: z.any().optional(),
                envVar: z.string().optional(),
                choices: z.array(z.string()).optional(),
                type: z.enum(["number", "string", "boolean", "url", "path"]).optional(),
            }).strict()
        )
        .optional()
        .default([]),
}).strict();
const ExtendedAlfredCommandSchema = AlfredCommandSchema.extend({
    extends: z.string(),
}).deepPartial();

const AlfredCommandsSchema = z.array(
    z.union([AlfredCommandSchema, ExtendedAlfredCommandSchema])
).superRefine((commands, ctx) => {
    const commandNames = commands.map((cmd) => cmd.name);
    commands.forEach((cmd, index) => {
        if ("extends" in cmd) {
            if (!commandNames.includes(cmd.extends ?? "")) {
                ctx.addIssue({
                    path: [index, "extends"],
                    message: `Command "${cmd.extends}" not found`,
                    fatal: true,
                    code: "custom",
                });
            }
        }
    });
});

type AlfredCommands = z.infer<typeof AlfredCommandsSchema>;
type AlfredCommand = z.infer<typeof AlfredCommandSchema>;


//#region main

async function main() {
    const program = new Command().version("0.0.1").description("Alfred CLI");

    const parsedAlfredCommands = AlfredCommandsSchema.parse(alfredCommands);

    parsedAlfredCommands.forEach((alfredCommand) => {
        const isExtends = "extends" in alfredCommand;
        if (isExtends) {
            const parentCommand = parsedAlfredCommands.find(
                (cmd) => cmd.name === alfredCommand.extends
            );
            if (!parentCommand) {
                throw new Error(`Command ${alfredCommand.extends} not found`);
            }
            alfredCommand = merge(parentCommand, alfredCommand) as AlfredCommand;
        }
        const safeCommand = AlfredCommandSchema.parse(alfredCommand);

        const command = program
            .command(safeCommand.name)
            .description(safeCommand.description)
            .action(async (options, command) => {
                console.log(options);
                console.log(`Running command: ${safeCommand.name} 🚀`);
                console.log(`Description: ${safeCommand.description}`);
                if (safeCommand.config?.confirm) {
                    const isConfirm = confirm(
                        `Are you sure you want to run this command? ${safeCommand.name}`
                    );
                    if (!isConfirm) {
                        console.log("Command canceled ❌");
                        return;
                    }
                }

                if (!Array.isArray(safeCommand.command)) {
                    await execCommand(safeCommand.command);
                    return;
                }
                await Promise.all(
                    safeCommand.command.map((command) => execCommand(command))
                );
                return this;
            });
        safeCommand.options?.map((option) => buildOptions(command, option));
    });


    const isEmptyCommand = process.argv.length === 2;
    if (isEmptyCommand) {
        const command = await autocomplete({
            message: "Select a command 🤖  ",
            source: async (input) => {
                return alfredCommands
                    .filter((alfredCommand) =>
                        alfredCommand.name.includes(input ?? "")
                    )
                    .map((alfredCommand) => {
                        return {
                            value: alfredCommand.name,
                            name: `${chalk.bold(alfredCommand.name)} (${chalk.italic(
                                alfredCommand.description
                            )})`,
                        };
                    });
            },
        });
        await program.parseAsync([process.argv[0], process.argv[1], command]);
    } else {
        await program.parseAsync(process.argv);
    }
}

main();
function buildOptions(
    command: Command,
    option: AlfredCommand["options"][number]
): Command {
    if (!option) {
        return command;
    }
    const {
        flags,
        description,
        required,
        defaultValue,
        choices,
        envVar,
        type,
    } = option;
    const commandOptions = command.createOption(flags, description);

    if (required) {
       commandOptions.makeOptionMandatory(true);
    }
    if (defaultValue) {
        commandOptions.default(defaultValue);
        commandOptions.preset(defaultValue);
    }
    if (choices) {
        commandOptions.choices(choices);
    }
    if (envVar) {
        commandOptions.env(envVar);
    }
    if (type){
        switch (type) {
            case "number":
                commandOptions.argParser(Number);
                break;
            case "string":
                commandOptions.argParser(String);
                break;
            case "boolean":
                commandOptions.argParser((v) => v.toLowerCase() === "true");
                break;
            case "url":
                ;
                commandOptions.argParser((value: string) => new URL(z.string().url().parse(value)));
                break;
            default:
                throw new Error(`Type ${type} not supported`);
        }
    }

    command.addOption(commandOptions);
    return command;
}
async function execCommand(
    command: AlfredCommand['command']
) {
    execRelativeCdCommand(command.dir);
    const script = command.cmd;

    const { stderr, stdout, exitCode } = await $`bash -c ${script}`.nothrow();
    if (exitCode === 0) {
        console.log(stdout.toString());
    } else {
        console.error(stderr.toString());
        console.log(`Exit code: ${exitCode}`);
    }
}
//#endregion

function execRelativeCdCommand(dir: string | undefined | null): void {
    if (!dir) {
        return;
    }
    const useHomeDir = dir.startsWith("~");
    if (useHomeDir) {
        dir = dir.replace("~", os.homedir());
    }
    cd(dir);
}
