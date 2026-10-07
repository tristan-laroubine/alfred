import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandsFilePath, createCommandsFile, legacyCommandsFilePaths, loadCommands, migrateLegacyCommandsFile } from "./config";

// HOME is a temporary directory (see test/setup.ts)
const home = process.env.HOME!;
const env = { HOME: home };

beforeEach(() => {
    if (!home.startsWith(fs.realpathSync(os.tmpdir()))) {
        throw new Error(`Refusing to run outside of a temporary HOME (${home})`);
    }
    for (const entry of fs.readdirSync(home)) {
        fs.rmSync(path.join(home, entry), { recursive: true, force: true });
    }
});

describe("commandsFilePath", () => {
    test("defaults to ~/.config/alfred", () => {
        expect(commandsFilePath(env)).toBe(path.join(home, ".config", "alfred", "commands.json"));
    });
    test("honours XDG_CONFIG_HOME and ALFRED_COMMANDS", () => {
        expect(commandsFilePath({ ...env, XDG_CONFIG_HOME: "/x" })).toBe("/x/alfred/commands.json");
        expect(commandsFilePath({ ...env, ALFRED_COMMANDS: "~/sync/alfred.json" })).toBe(path.join(home, "sync", "alfred.json"));
    });
});

describe("migrateLegacyCommandsFile", () => {
    test("moves the old file and leaves a link", () => {
        const [legacy] = legacyCommandsFilePaths(env);
        expect(legacy.startsWith(home)).toBe(true);
        fs.mkdirSync(path.dirname(legacy), { recursive: true });
        fs.writeFileSync(legacy, "[]");

        expect(migrateLegacyCommandsFile(env)).toEqual({ from: legacy, to: commandsFilePath(env) });
        expect(fs.readFileSync(commandsFilePath(env), "utf-8")).toBe("[]");
        expect(fs.lstatSync(legacy).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(legacy, "utf-8")).toBe("[]");
        // Second run: nothing to do
        expect(migrateLegacyCommandsFile(env)).toBeUndefined();
    });
    test("does nothing without an old file", () => {
        expect(migrateLegacyCommandsFile(env)).toBeUndefined();
    });
});

test("the example commands are valid", () => {
    createCommandsFile();
    expect(loadCommands().commands.length).toBeGreaterThan(0);
});

test("missing file", () => {
    expect(() => loadCommands()).toThrow("No commands file found at ~/.config/alfred/commands.json");
});
