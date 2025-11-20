import { Command } from "commander";
import autocomplete from "inquirer-autocomplete-standalone";
import { $, cd, os } from "zx";
import z, { ZodError } from "zod";
import chalk from "chalk";
import { merge } from "lodash";
import { AlfredCommand, AlfredCommandSchema, AlfredCommandsSchema } from "./alfredCommandSchema";
import { version, description } from "../package.json";
import { log as tabtabLog, parseEnv as tabtabParseEnv } from "tabtab";
import { getCommandsCache } from "./localCache";
import { installCompletion } from "./completion";
//#region main
$.verbose = true;


async function handleInitCommand() {
    const isContainsInitCommand = process.argv.includes("--init");
    if (!isContainsInitCommand) {
        return;
    }
    console.log("🤖 Initializing alfred CLI...");
    await installCompletion();
    console.log("✅ alfred CLI initialized.");
    process.exit(0);
}


async function main() {
    await handleInitCommand();
    try {
        const program = new Command().version(version).description(description).option(
            '--init', 'Initialize alfred CLI on your system'
        )
        const rawCommands = await getCommandsCache(true);
        const parsedAlfredCommands = AlfredCommandsSchema.parse(rawCommands);

        parsedAlfredCommands.forEach((alfredCommand) => {
            const isExtends = "extends" in alfredCommand;
            if (isExtends) {
                const parentCommand = parsedAlfredCommands.find(
                    (cmd) => cmd.name === alfredCommand.extends
                );
                if (!parentCommand) {
                    throw new Error(`Illegal state error`);
                }
                if (alfredCommand?.command?.cmd) {
                    alfredCommand.command.cmd = alfredCommand.command.cmd.replace("{super}", parentCommand?.command?.cmd ?? "");
                }
                alfredCommand = merge({}, parentCommand, alfredCommand) as AlfredCommand;
            }
            const safeCommand = AlfredCommandSchema.parse(alfredCommand);

            const command = program
                .command(safeCommand.name)
                .description(safeCommand.description)
                .action(async (options: Record<string, string | number | boolean> | undefined, command) => {
                    console.log(`🤖 Running command: ${safeCommand.name}`);
                    if (safeCommand.config?.confirm) {
                        const isConfirm = confirm(
                            `Are you sure you want to run this command? ${safeCommand.name}`
                        );
                        if (!isConfirm) {
                            console.log("Command canceled ❌");
                            return;
                        }
                    }

                    await execCommand(safeCommand.command, options);
                    return;
                });
            safeCommand.options?.map((option) => buildOptions(command, option));
        });
        buildCompletionOption(program, parsedAlfredCommands as AlfredCommand[]);

        const isEmptyCommand = process.argv.length === 2;
        if (isEmptyCommand) {
            const command = await autocomplete({
                message: "Select a command 🤖  ",
                source: async (input) => {
                    return parsedAlfredCommands
                        .filter((alfredCommand) =>
                            alfredCommand.name?.includes(input ?? "")
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

            await program.parseAsync([process.argv[0], process.argv[1], command ?? ""]);
        } else {
            await program.parseAsync(process.argv);
        }
    } catch (error) {
        if (error instanceof ZodError) {
            console.error(`There is a format error in the command configuration. Please correct it by referring to the manual.`);
            const zodInfo = error.errors[0];
            console.error(`Code: ${zodInfo.code}`);
            console.error(`Message: ${zodInfo.message}`);
            console.error(`Path: ${zodInfo.path.join(".")}`);
            process.exit(22);
        }
        throw error;
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
    if (type) {
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
function buildCompletionOption(program: Command, alfredCommands: AlfredCommand[]) {
    const globalCommandOptions = [{
        name: "--version",
        description: "Show version number",
    },
    {
        name: "--help",
        description: "Show help",
    }];
    program
        .command("completion")
        .description("Generate completion script")
        .action(() => {
            const env = tabtabParseEnv(process.env);
            
            if (env.words === 1 && env.prev === "alfred") {
                tabtabLog([...alfredCommands.map((command) => {
                    return {
                        name: command.name,
                        description: command.description,
                    }
                }),
            ...globalCommandOptions
         ]);
                return;
            }
            // 
            // Complete the command
            if (env.prev !== "alfred") {
                const command = alfredCommands.find((command) => command.name === env.prev);
                // log([JSON.stringify(command?.options, null, 2)]);
                const descriptions = command?.options?.map((option) => {
                    const extractFlagNameRegex = /(--\w+)/;
                    const matches = extractFlagNameRegex.exec(option.flags);
                    return {
                        name: matches?.[1],
                        description: `${option.flags} ${option.description}`,
                    }
                }).filter(({ name }) => name !== undefined);

                tabtabLog([...descriptions ?? [], ...globalCommandOptions]);

                return;
            }
            
        });
}
async function execCommand(
    command: AlfredCommand['command'],
    options: Record<string, string | number | boolean> = {}
) {
    execRelativeCdCommand(command.dir);
    let script = command.cmd;
    // https://regex101.com/r/BKNCeu/1
    const commandOptionsRegex = /(\$\{(\w+)\})/g;
    const matches = [...script.matchAll(commandOptionsRegex)];
    for (const match of matches) {
        const [_, fullMatch, optionName] = match;
        const optionValue = options[optionName];
        if (optionValue === undefined || optionValue === null) {
            script = script.replace(` ${fullMatch}`, "");
        } else {
            script = script.replace(fullMatch, optionValue.toString());
        }
    }

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
