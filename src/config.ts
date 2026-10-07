import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { z } from "zod";
import exampleCommands from "../assets/example.commands.json";
import { ConfigError } from "./errors";
import { type AlfredCommand, CommandsFileSchema, type RawCommand, resolveCommands } from "./schema";

/** $HOME first: Bun's os.homedir() ignores changes made to it at runtime. */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
    return env.HOME || os.homedir();
}

export function expandHome(value: string): string {
    if (value === "~" || value.startsWith("~/")) {
        return path.join(homeDir(), value.slice(1));
    }
    return value;
}

/** Replace the home directory by "~" for display. */
export function tildify(value: string): string {
    const home = homeDir();
    return value === home || value.startsWith(home + path.sep) ? "~" + value.slice(home.length) : value;
}

/**
 * $ALFRED_COMMANDS, or ~/.config/alfred/commands.json (honours $XDG_CONFIG_HOME).
 */
export function commandsFilePath(env: NodeJS.ProcessEnv = process.env): string {
    if (env.ALFRED_COMMANDS) {
        return path.resolve(expandHome(env.ALFRED_COMMANDS));
    }
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDir(env), ".config");
    return path.join(configHome, "alfred", "commands.json");
}

/** Where versions <= 0.7 stored the commands (env-paths cache directory). */
export function legacyCommandsFilePaths(env: NodeJS.ProcessEnv = process.env): string[] {
    const home = homeDir(env);
    switch (process.platform) {
        case "darwin":
            return [path.join(home, "Library", "Caches", "allfy-nodejs", "commands.json")];
        case "win32":
            return env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, "allfy-nodejs", "Cache", "commands.json")] : [];
        default:
            return [path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "allfy-nodejs", "commands.json")];
    }
}

function isRegularFile(file: string): boolean {
    try {
        return fs.lstatSync(file).isFile();
    } catch {
        return false;
    }
}

/**
 * Move the commands file out of the cache directory (which macOS may purge)
 * and leave a symlink behind so existing references keep working.
 */
export function migrateLegacyCommandsFile(env: NodeJS.ProcessEnv = process.env): { from: string; to: string } | undefined {
    if (env.ALFRED_COMMANDS) {
        return;
    }
    const target = commandsFilePath(env);
    if (fs.existsSync(target)) {
        return;
    }
    const legacy = legacyCommandsFilePaths(env).find(isRegularFile);
    if (!legacy) {
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(legacy, target, fs.constants.COPYFILE_EXCL);
    fs.rmSync(legacy);
    try {
        fs.symlinkSync(target, legacy);
    } catch {
        // Not critical, the file has been moved anyway
    }
    return { from: legacy, to: target };
}

export function createCommandsFile(file: string = commandsFilePath()): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(exampleCommands, null, 4) + "\n", { flag: "wx" });
}

function formatIssues(error: z.ZodError, data: unknown): string[] {
    return error.issues.map((issue) => {
        const [index, ...rest] = issue.path;
        if (typeof index !== "number") {
            return issue.message;
        }
        const name = Array.isArray(data) ? (data[index] as { name?: unknown } | undefined)?.name : undefined;
        const where = typeof name === "string" && name ? `"${name}"` : `#${index + 1}`;
        const field = rest.length ? `${rest.join(".")}: ` : "";
        return `${where} ${field}${issue.message}`;
    });
}

export interface LoadedCommands {
    file: string;
    raw: RawCommand[];
    commands: AlfredCommand[];
}

export function parseCommands(text: string, file: string): LoadedCommands {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new ConfigError(`${file} is not valid JSON`, [(error as Error).message]);
    }
    const result = CommandsFileSchema.safeParse(data);
    if (!result.success) {
        throw new ConfigError(`${file} has errors`, formatIssues(result.error, data));
    }
    return { file, raw: result.data, commands: resolveCommands(result.data) };
}

export function loadCommands(file: string = commandsFilePath()): LoadedCommands {
    let text: string;
    try {
        text = fs.readFileSync(file, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new ConfigError(`No commands file found at ${tildify(file)}`, [], "not-found");
        }
        throw error;
    }
    return parseCommands(text, tildify(file));
}
