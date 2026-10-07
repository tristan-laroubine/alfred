#!/usr/bin/env node
import confirm from "@inquirer/confirm";
import { Command, Option } from "commander";
import pc from "picocolors";
import { description, version } from "../package.json";
import { doctor, editCommands, initAlfred, listCommands } from "./builtins";
import {
    completionCandidates,
    completionScript,
    detectShell,
    formatCandidates,
    isShell,
    wordsFromLine,
} from "./completion";
import {
    commandsFilePath,
    createCommandsFile,
    type LoadedCommands,
    loadCommands,
    migrateLegacyCommandsFile,
    tildify,
} from "./config";
import { AlfredError, ConfigError, printError } from "./errors";
import { createOption, promptOptions } from "./options";
import { pickCommand } from "./picker";
import { resolveWorkingDirectory, runCommand } from "./run";
import type { AlfredCommand } from "./schema";

const BUILTINS = [
    { value: "list", description: "List your commands" },
    { value: "edit", description: "Edit your commands file" },
    { value: "init", description: "Create the commands file and enable shell completion" },
    { value: "doctor", description: "Check your setup and your commands file" },
    { value: "completion", description: "Print the shell completion script" },
];

const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function runAlfredCommand(
    command: AlfredCommand,
    values: Record<string, unknown>,
    args: string[],
    skipConfirm: boolean
): Promise<void> {
    const cwd = resolveWorkingDirectory(command.command.dir);
    // Status messages go to stderr so the command output can be piped
    console.error(`🤖 ${pc.bold(command.name)}${command.command.dir ? pc.dim(` in ${tildify(cwd)}`) : ""}`);

    if (command.config.confirm && !skipConfirm) {
        if (!isInteractive()) {
            throw new AlfredError(`"${command.name}" needs a confirmation`, { hint: "Run it with --yes." });
        }
        console.error(pc.dim(`$ ${command.command.cmd}`));
        if (!(await confirm({ message: "Run it?", default: false }))) {
            console.error("Canceled");
            return;
        }
    }

    const exitCode = await runCommand(command, { values, args });
    if (exitCode !== 0 && exitCode !== 130) {
        console.error(pc.red(`✖ ${command.name} exited with code ${exitCode}`));
    }
    process.exitCode = exitCode;
}

function addUserCommand(program: Command, command: AlfredCommand): void {
    const subcommand = program
        .command(command.name)
        .description(command.description)
        // Extra arguments are available as "$@" in the command
        .allowExcessArguments();
    for (const option of command.options) {
        subcommand.addOption(createOption(option));
    }
    const addYes =
        command.config.confirm &&
        !command.options.some(({ flags }) => {
            const option = new Option(flags);
            return option.long === "--yes" || option.short === "-y";
        });
    if (addYes) {
        subcommand.option("-y, --yes", "Run without asking for confirmation");
    }
    subcommand.action(async (values: Record<string, unknown>, self: Command) => {
        const { yes, ...optionValues } = values;
        await runAlfredCommand(command, addYes ? optionValues : values, self.args, Boolean(addYes && yes));
    });
}

async function main(argv: string[]): Promise<void> {
    const builtinNames = [...BUILTINS.map(({ value }) => value), "help", "__complete"];
    const isCompletion = argv[0] === "completion" || argv[0] === "__complete";

    if (!isCompletion) {
        const migrated = migrateLegacyCommandsFile();
        if (migrated) {
            console.error(`📦 Your commands moved to ${pc.bold(tildify(migrated.to))}`);
            console.error(pc.dim(`   (a link was left at ${tildify(migrated.from)})`));
        }
    }

    let loaded: LoadedCommands | undefined;
    let loadError: ConfigError | undefined;
    try {
        loaded = loadCommands();
    } catch (error) {
        if (!(error instanceof ConfigError)) {
            throw error;
        }
        loadError = error;
    }

    if (argv.length === 0) {
        if (!isInteractive()) {
            argv = ["--help"];
        } else if (loadError?.reason === "not-found") {
            const file = tildify(commandsFilePath());
            if (!(await confirm({ message: `No commands yet. Create ${file} with a few examples?`, default: true }))) {
                return;
            }
            createCommandsFile();
            loaded = loadCommands();
            loadError = undefined;
            console.log(`${pc.green("✔")} Created ${file}, edit it with ${pc.bold("alfred edit")}`);
        } else if (loadError) {
            throw loadError;
        }
    } else if (loadError && !builtinNames.includes(argv[0]) && !argv[0].startsWith("-")) {
        throw loadError;
    }

    const program = new Command("alfred")
        .description(description)
        .version(version)
        .showSuggestionAfterError()
        .showHelpAfterError(pc.dim("(add --help for more information)"));
    if (loadError) {
        program.addHelpText("after", `\n${pc.yellow("⚠")} ${loadError.message}\n  ${pc.dim(loadError.hint ?? "")}`);
    }

    program.commandsGroup("Your commands:");
    for (const command of loaded?.commands ?? []) {
        addUserCommand(program, command);
    }

    program.commandsGroup("Alfred:");
    program
        .command("list")
        .description("List your commands")
        .option("--json", "Print the commands (with extends resolved) as JSON")
        .action((options: { json?: boolean }) => {
            if (!loaded) throw loadError;
            listCommands(loaded, options);
        });
    program
        .command("edit")
        .description("Edit your commands file ($VISUAL or $EDITOR)")
        .option("--path", "Only print the path of the commands file")
        .action(editCommands);
    program
        .command("init")
        .description("Create the commands file and enable shell completion")
        .argument("[shell]", "zsh, bash or fish (default: your current shell)")
        .option("-y, --yes", "Don't ask for confirmation")
        .action((shell: string | undefined, options: { yes?: boolean }) => initAlfred({ shell, ...options }));
    program
        .command("doctor")
        .description("Check your setup and your commands file")
        .action(doctor);
    program
        .command("completion")
        .description("Print the shell completion script")
        .argument("[shell]", "zsh, bash or fish (default: your current shell)")
        .addHelpText("after", '\nExample, in ~/.zshrc:\n  eval "$(alfred completion zsh)"')
        .allowExcessArguments()
        .action((shell: string | undefined) => {
            // Completion installed by alfred <= 0.7 (tabtab): `alfred completion -- <words>`
            if (process.env.COMP_LINE !== undefined && !isShell(shell)) {
                const line = process.env.COMP_LINE.slice(0, Number(process.env.COMP_POINT ?? process.env.COMP_LINE.length));
                const words = wordsFromLine(line);
                console.log(formatCandidates("zsh", completionCandidates(words, loaded?.commands ?? [], BUILTINS), ""));
                return;
            }
            const target = shell ?? detectShell();
            if (!isShell(target)) {
                throw new AlfredError(`Unsupported shell "${target ?? process.env.SHELL ?? ""}"`, {
                    hint: "Supported shells: zsh, bash, fish.",
                });
            }
            process.stdout.write(completionScript(target));
        });
    program.addHelpCommand(
        new Command("help").argument("[command]").description("Show help for a command").helpGroup("Alfred:")
    );
    program
        .command("__complete", { hidden: true })
        .argument("<shell>")
        .argument("[line]", "", "")
        .action((shell: string, line: string) => {
            if (!isShell(shell)) {
                return;
            }
            const words = wordsFromLine(line);
            const candidates = completionCandidates(words, loaded?.commands ?? [], BUILTINS);
            console.log(formatCandidates(shell, candidates, words.at(-1) ?? ""));
        });

    if (argv.length === 0 && loaded) {
        if (!loaded.commands.length) {
            console.log(`No commands yet, add some with ${pc.bold("alfred edit")}.`);
            return;
        }
        const picked = await pickCommand(loaded.commands);
        argv = [picked.name, ...(await promptOptions(picked.options))];
    }

    await program.parseAsync(argv, { from: "user" });
}

main(process.argv.slice(2)).catch((error) => {
    process.exitCode = printError(error);
});
