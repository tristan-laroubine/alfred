import { describe, expect, test } from "bun:test";
import fixture from "../test/fixtures/v0.7-commands.json";
import { parseCommands } from "./config";
import { ConfigError } from "./errors";
import { lintCommands } from "./schema";

const parse = (data: unknown) => parseCommands(JSON.stringify(data), "commands.json");

function configErrorOf(fn: () => unknown): ConfigError {
    try {
        fn();
    } catch (error) {
        if (error instanceof ConfigError) {
            return error;
        }
        throw error;
    }
    throw new Error("Expected a ConfigError");
}

describe("parseCommands", () => {
    test("accepts a commands file written for v0.7", () => {
        const { commands } = parse(fixture);
        expect(commands.map((command) => command.name)).toContain("app:serve-fast");
        const fast = commands.find((command) => command.name === "app:serve-fast")!;
        expect(fast.command).toEqual({ cmd: "./run.sh serve --assume-yes --no-checks", dir: "~/Developer/app" });
        expect(fast.description).toBe("Serve the app without checks");
    });

    test("resolves extends chains whatever the order", () => {
        const { commands } = parse([
            { name: "c", extends: "b", command: { cmd: "{super} c" } },
            { name: "b", extends: "a", command: { cmd: "{super} b" }, config: { confirm: true } },
            { name: "a", description: "A", command: { cmd: "a", dir: "/tmp" } },
        ]);
        expect(commands[0]).toMatchObject({
            name: "c",
            description: "A",
            command: { cmd: "a b c", dir: "/tmp" },
            config: { confirm: true },
        });
    });

    test("replaces every {super}", () => {
        const { commands } = parse([
            { name: "a", command: { cmd: "echo" } },
            { name: "b", extends: "a", command: { cmd: "{super} 1 && {super} 2" } },
        ]);
        expect(commands[1].command.cmd).toBe("echo 1 && echo 2");
    });

    test("extended commands inherit options and override them by name", () => {
        const { commands } = parse([
            {
                name: "a",
                command: { cmd: "echo" },
                options: [
                    { flags: "-n, --name [name]", description: "Name", defaultValue: "x" },
                    { flags: "--loud", description: "Loud" },
                ],
            },
            {
                name: "b",
                extends: "a",
                options: [
                    { flags: "--name <name>", description: "Required name" },
                    { flags: "--count [count]", type: "number" },
                ],
            },
        ]);
        expect(commands[1].options.map((option) => option.flags)).toEqual(["--name <name>", "--loud", "--count [count]"]);
    });

    test("reports invalid JSON", () => {
        const error = configErrorOf(() => parseCommands("[{", "commands.json"));
        expect(error.message).toBe("commands.json is not valid JSON");
    });

    test("reports every error at once, with the command name", () => {
        const error = configErrorOf(() =>
            parse([
                { name: "a", description: "no cmd" },
                { name: "b", extends: "nope" },
                { name: "c", command: { cmd: "x" }, options: [{ flags: "name" }] },
                { name: "init", command: { cmd: "x" } },
                { name: "a", command: { cmd: "x" } },
            ])
        );
        expect(error.details).toEqual([
            '"c" options.0.flags: Invalid flags, expected something like "-n, --name [name]"',
            '"a" command.cmd: Command is required (or use "extends" to inherit one)',
            '"b" extends: Unknown command "nope"',
            '"init" name: "init" is reserved by alfred, please rename this command',
            '"a" name: Command "a" is defined more than once',
        ]);
    });

    test("reports extends cycles", () => {
        const error = configErrorOf(() =>
            parse([
                { name: "x", extends: "y" },
                { name: "y", extends: "x" },
            ])
        );
        expect(error.details).toEqual([
            '"x" extends: Circular "extends": x -> y -> x',
            '"y" extends: Circular "extends": y -> x -> y',
        ]);
    });

    test("accepts the path type", () => {
        const { commands } = parse([
            { name: "a", command: { cmd: "ls ${dir}" }, options: [{ flags: "--dir <dir>", type: "path" }] },
        ]);
        expect(commands[0].options[0].type).toBe("path");
    });
});

describe("lintCommands", () => {
    test("warns about placeholders missing their $", () => {
        const { raw, commands } = parse(fixture);
        expect(lintCommands(raw, commands)).toEqual(['"pkill": "{name}" is never replaced, did you mean "${name}"?']);
    });
});
