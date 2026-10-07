import { describe, expect, test } from "bun:test";
import { parseCommands } from "./config";
import { buildOptionsEnv, resolveWorkingDirectory, runCommand } from "./run";

const command = (data: object) => parseCommands(JSON.stringify([data]), "commands.json").commands[0];

describe("buildOptionsEnv", () => {
    test("exposes every option, empty when not given", () => {
        const hello = command({
            name: "hello",
            command: { cmd: "echo" },
            options: [{ flags: "-n, --name [name]" }, { flags: "--dry-run" }, { flags: "--count [count]", type: "number" }],
        });
        expect(buildOptionsEnv(hello, { name: "it's", count: 3 })).toEqual({ name: "it's", dryRun: "", count: "3" });
    });
});

describe("runCommand", () => {
    const capture = async (data: object, values: Record<string, unknown> = {}, args: string[] = []) => {
        const out = `${process.env.TMPDIR ?? "/tmp"}/alfred-test-${Math.random()}`;
        const code = await runCommand(command({ ...data, command: { ...("command" in data ? (data.command as object) : {}), cmd: `(${(data as any).command.cmd}) > "${out}"` } }), { values, args });
        const output = await Bun.file(out).text();
        await Bun.file(out).delete();
        return { code, output };
    };

    test("values are not interpreted by the shell", async () => {
        const { output } = await capture(
            { name: "q", command: { cmd: "echo '${msg}' \"${msg}\"" }, options: [{ flags: "--msg [msg]" }] },
            { msg: "it's $(whoami)" }
        );
        // single quotes keep ${msg} literal, double quotes expand it safely
        expect(output).toBe("${msg} it's $(whoami)\n");
    });

    test("keeps environment variables", async () => {
        const { output } = await capture({ name: "h", command: { cmd: "echo ${HOME}" } });
        expect(output).toBe(`${process.env.HOME}\n`);
    });

    test("passes extra arguments as $@", async () => {
        const { output } = await capture({ name: "args", command: { cmd: 'echo "$0" "$#" "$@"' } }, {}, ["a b", "c"]);
        expect(output).toBe("args 2 a b c\n");
    });

    test("supports bash arrays", async () => {
        const { output } = await capture({ name: "arr", command: { cmd: 'a=(x y); echo "${a[@]}"' } });
        expect(output).toBe("x y\n");
    });

    test("returns the exit code", async () => {
        expect(await runCommand(command({ name: "f", command: { cmd: "exit 3" } }))).toBe(3);
    });

    test("runs in dir", async () => {
        const { output } = await capture({ name: "d", command: { cmd: "pwd", dir: "/" } });
        expect(output).toBe("/\n");
    });
});

describe("resolveWorkingDirectory", () => {
    test("expands ~", () => {
        expect(resolveWorkingDirectory("~")).toBe(process.env.HOME!);
    });
    test("fails on a missing directory", () => {
        expect(() => resolveWorkingDirectory("/nope/nope")).toThrow("Directory not found: /nope/nope");
    });
});
