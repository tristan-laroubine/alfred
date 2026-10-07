import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import confirm from "@inquirer/confirm";
import pc from "picocolors";
import { version } from "../package.json";
import { completionScript, detectShell, isShell, type Shell } from "./completion";
import {
    commandsFilePath,
    createCommandsFile,
    expandHome,
    homeDir,
    legacyCommandsFilePaths,
    loadCommands,
    type LoadedCommands,
    tildify,
} from "./config";
import { AlfredError, ConfigError, printError } from "./errors";
import { lintCommands } from "./schema";

const ok = (message: string) => console.log(`${pc.green("✔")} ${message}`);
const warn = (message: string) => console.log(`${pc.yellow("⚠")} ${message}`);
const fail = (message: string) => console.log(`${pc.red("✖")} ${message}`);
const info = (message: string) => console.log(`  ${pc.dim(message)}`);

const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

//#region list

export function listCommands(loaded: LoadedCommands, { json = false }: { json?: boolean } = {}): void {
    if (json) {
        console.log(JSON.stringify(loaded.commands, null, 2));
        return;
    }
    if (!loaded.commands.length) {
        console.log(`No commands yet, add some with ${pc.bold("alfred edit")}.`);
        return;
    }
    const width = Math.min(Math.max(...loaded.commands.map((command) => command.name.length)), 30);
    for (const command of loaded.commands) {
        const flags = command.options.map((option) => option.flags.split(/[ ,|]+/).find((flag) => flag.startsWith("--")) ?? option.flags);
        const extras = [command.config.confirm ? "confirm" : "", flags.join(" ")].filter(Boolean).join(" · ");
        console.log(`  ${pc.bold(command.name.padEnd(width))}  ${command.description}${extras ? pc.dim(`  ${extras}`) : ""}`);
    }
    console.log(pc.dim(`\n${plural(loaded.commands.length, "command")} from ${loaded.file}`));
}

//#endregion

//#region edit

export async function editCommands({ path: printPath = false }: { path?: boolean } = {}): Promise<void> {
    const file = commandsFilePath();
    if (printPath) {
        console.log(file);
        return;
    }
    if (!fs.existsSync(file)) {
        createCommandsFile(file);
        ok(`Created ${tildify(file)} with example commands`);
    }
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) {
        const opener = process.platform === "darwin" ? ["open", "-t"] : ["xdg-open"];
        spawn(opener[0], [...opener.slice(1), file], { stdio: "ignore", detached: true }).on("error", () => {
            console.log(file);
        }).unref();
        info(`Opening ${tildify(file)}. Set $EDITOR to edit it in the terminal, then run "alfred doctor" to check it.`);
        return;
    }
    // $EDITOR may contain arguments, e.g. "code -w"
    const result = spawnSync("sh", ["-c", `${editor} "$1"`, "sh", file], { stdio: "inherit" });
    if (result.status !== 0) {
        throw new AlfredError(`The editor exited with code ${result.status}`);
    }
    try {
        const { commands } = loadCommands(file);
        ok(`${plural(commands.length, "command")}, no errors`);
    } catch (error) {
        process.exitCode = printError(error);
    }
}

//#endregion

//#region init

function shellRcFile(shell: Exclude<Shell, "fish">): string {
    if (shell === "zsh") {
        return path.join(process.env.ZDOTDIR || homeDir(), ".zshrc");
    }
    return path.join(homeDir(), ".bashrc");
}

function fishCompletionFile(): string {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(homeDir(), ".config");
    return path.join(configHome, "fish", "completions", "alfred.fish");
}

/** Files created by `alfred init` in versions <= 0.7 (tabtab). */
function legacyTabtabFiles(): string[] {
    const root = path.join(homeDir(), ".config", "tabtab");
    return ["", "zsh", "bash", "fish"]
        .flatMap((dir) => ["zsh", "bash", "fish"].map((ext) => path.join(root, dir, `alfred.${ext}`)))
        .filter((file) => fs.existsSync(file));
}

function removeLegacyTabtab(files: string[]): void {
    for (const file of files) {
        fs.rmSync(file);
        // tabtab's loader (__tabtab.<ext>) sources alfred.<ext> with a 2 lines comment header
        const loader = path.join(path.dirname(file), `__tabtab${path.extname(file)}`);
        if (!fs.existsSync(loader)) {
            continue;
        }
        const lines = fs.readFileSync(loader, "utf-8").split("\n");
        const index = lines.findIndex((line) => line.includes(path.basename(file)) && !line.trimStart().startsWith("#"));
        if (index === -1) {
            continue;
        }
        let start = index;
        while (start > 0 && start > index - 2 && lines[start - 1].trimStart().startsWith("#")) {
            start--;
        }
        lines.splice(start, index - start + 1);
        fs.writeFileSync(loader, lines.join("\n"));
    }
}

async function ask(message: string, yes: boolean): Promise<boolean> {
    if (yes) {
        return true;
    }
    if (!isInteractive()) {
        return false;
    }
    return confirm({ message, default: true });
}

export async function initAlfred({ shell: shellArg, yes = false }: { shell?: string; yes?: boolean } = {}): Promise<void> {
    // 1. Commands file
    const file = commandsFilePath();
    if (fs.existsSync(file)) {
        ok(`Commands file: ${tildify(file)}`);
    } else {
        createCommandsFile(file);
        ok(`Created ${tildify(file)} with example commands`);
    }

    // 2. Shell completion
    if (shellArg !== undefined && !isShell(shellArg)) {
        throw new AlfredError(`Unsupported shell "${shellArg}"`, { hint: "Supported shells: zsh, bash, fish." });
    }
    const shell = shellArg ?? detectShell();
    if (!shell) {
        warn("Couldn't detect your shell, completion not enabled");
        info('Add `eval "$(alfred completion zsh)"` (or bash) to your shell config.');
    } else if (shell === "fish") {
        const target = fishCompletionFile();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, completionScript("fish"));
        ok(`Completion installed in ${tildify(target)}`);
    } else {
        const rcFile = shellRcFile(shell);
        const line = `eval "$(alfred completion ${shell})"`;
        const content = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, "utf-8") : "";
        if (content.includes(`alfred completion ${shell}`)) {
            ok(`Completion already enabled in ${tildify(rcFile)}`);
        } else if (await ask(`Enable ${shell} completion? (adds a line to ${tildify(rcFile)})`, yes)) {
            const separator = content === "" || content.endsWith("\n") ? "" : "\n";
            fs.appendFileSync(rcFile, `${separator}\n# alfred completion\n${line}\n`);
            ok(`Completion enabled in ${tildify(rcFile)}, open a new terminal to use it`);
        } else {
            info(`Completion not enabled. To do it manually, add to ${tildify(rcFile)}:  ${line}`);
        }
    }

    // 3. Old tabtab completion (alfred <= 0.7)
    const tabtabFiles = legacyTabtabFiles();
    if (tabtabFiles.length) {
        if (await ask("Remove the old alfred completion (tabtab) installed by a previous version?", yes)) {
            removeLegacyTabtab(tabtabFiles);
            ok("Old tabtab completion removed");
        } else {
            info(`Old tabtab completion kept: ${tabtabFiles.map(tildify).join(", ")}`);
        }
    }
}

//#endregion

//#region doctor

function isEnabledInRc(shell: Shell): boolean {
    if (shell === "fish") {
        return fs.existsSync(fishCompletionFile());
    }
    const rcFile = shellRcFile(shell);
    return fs.existsSync(rcFile) && fs.readFileSync(rcFile, "utf-8").includes(`alfred completion ${shell}`);
}

function isInstalledByHomebrew(shell: Shell): boolean {
    const prefixes = [process.env.HOMEBREW_PREFIX, "/opt/homebrew", "/usr/local", "/home/linuxbrew/.linuxbrew"];
    const relative = {
        zsh: "share/zsh/site-functions/_alfred",
        bash: "etc/bash_completion.d/alfred",
        fish: "share/fish/vendor_completions.d/alfred.fish",
    }[shell];
    return prefixes.some((prefix) => prefix && fs.existsSync(path.join(prefix, relative)));
}

export function doctor(): void {
    let errors = 0;
    const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;
    ok(`alfred ${version} (${runtime}, ${process.platform}-${process.arch})`);
    info(tildify(process.execPath));

    const bash = spawnSync("bash", ["--version"], { encoding: "utf-8" });
    if (bash.status === 0) {
        ok(`bash: ${bash.stdout.split("\n")[0]}`);
    } else {
        errors++;
        fail("bash not found, alfred runs commands with bash");
    }

    // Commands file
    const file = commandsFilePath();
    const source = process.env.ALFRED_COMMANDS ? " (from $ALFRED_COMMANDS)" : "";
    let loaded: LoadedCommands | undefined;
    try {
        loaded = loadCommands(file);
        ok(`${plural(loaded.commands.length, "command")} in ${tildify(file)}${source}`);
    } catch (error) {
        errors++;
        if (error instanceof ConfigError) {
            fail(error.message + source);
            error.details.forEach((detail) => info(`• ${detail}`));
            if (error.hint) info(error.hint);
        } else {
            fail(String(error));
        }
    }
    if (loaded) {
        for (const warning of lintCommands(loaded.raw, loaded.commands)) {
            warn(warning);
        }
        for (const command of loaded.commands) {
            const dir = command.command.dir;
            if (dir && !fs.statSync(path.resolve(expandHome(dir)), { throwIfNoEntry: false })?.isDirectory()) {
                warn(`"${command.name}": directory not found: ${dir}`);
            }
        }
    }
    for (const legacy of legacyCommandsFilePaths()) {
        const stat = fs.lstatSync(legacy, { throwIfNoEntry: false });
        if (stat?.isFile()) {
            warn(`Old commands file still present: ${tildify(legacy)}`);
        }
    }

    // Completion
    const shell = detectShell();
    if (shell) {
        if (isEnabledInRc(shell)) {
            ok(`${shell} completion enabled`);
        } else if (isInstalledByHomebrew(shell)) {
            ok(`${shell} completion installed by Homebrew`);
        } else {
            warn(`${shell} completion not enabled, run ${pc.bold("alfred init")}`);
        }
    }
    if (legacyTabtabFiles().length) {
        warn(`Old tabtab completion found, run ${pc.bold("alfred init")} to remove it`);
    }

    if (errors) {
        process.exitCode = 1;
    }
}

//#endregion
