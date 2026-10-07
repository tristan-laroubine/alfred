import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandHome } from "./config";
import { AlfredError } from "./errors";
import { type AlfredCommand, optionAttributeName } from "./schema";

/**
 * Options are given to bash as variables: `${message}` in a command is expanded
 * by bash itself, so values are never re-interpreted as shell code.
 */
export function buildOptionsEnv(
    command: AlfredCommand,
    values: Record<string, unknown>
): Record<string, string> {
    const env: Record<string, string> = {};
    for (const option of command.options) {
        const name = optionAttributeName(option);
        const value = values[name];
        if (value === undefined || value === null) {
            env[name] = "";
        } else if (Array.isArray(value)) {
            env[name] = value.join(" ");
        } else {
            env[name] = String(value);
        }
    }
    return env;
}

export function resolveWorkingDirectory(dir: string | undefined, cwd: string = process.cwd()): string {
    if (!dir) {
        return cwd;
    }
    const resolved = path.resolve(cwd, expandHome(dir));
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
        throw new AlfredError(`Directory not found: ${dir}`, {
            hint: 'Check the "dir" of this command with `alfred edit`.',
        });
    }
    return resolved;
}

/**
 * Run the command with bash, attached to the current terminal.
 * Extra arguments are available as "$@" / "$1"... in the command.
 * Resolves with the exit code.
 */
export function runCommand(
    command: AlfredCommand,
    { values = {}, args = [] }: { values?: Record<string, unknown>; args?: string[] } = {}
): Promise<number> {
    const cwd = resolveWorkingDirectory(command.command.dir);
    return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", command.command.cmd, command.name, ...args], {
            cwd,
            env: { ...process.env, ...buildOptionsEnv(command, values) },
            stdio: "inherit",
        });
        // Ctrl+C is received by the child too: let it decide how to exit
        const ignoreSignal = () => {};
        process.on("SIGINT", ignoreSignal);
        process.on("SIGTERM", ignoreSignal);
        const cleanup = () => {
            process.off("SIGINT", ignoreSignal);
            process.off("SIGTERM", ignoreSignal);
        };
        child.on("error", (error) => {
            cleanup();
            reject(error);
        });
        child.on("close", (code, signal) => {
            cleanup();
            if (code !== null) {
                resolve(code);
            } else {
                resolve(128 + (signal ? (os.constants.signals[signal] ?? 0) : 0));
            }
        });
    });
}
