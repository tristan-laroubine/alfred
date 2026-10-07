import { describe, expect, test } from "bun:test";
import { completionCandidates, formatCandidates, wordsFromLine } from "./completion";
import { parseCommands } from "./config";

const { commands } = parseCommands(
    JSON.stringify([
        { name: "git:empty-commit", description: "Empty commit", command: { cmd: "git" }, options: [{ flags: "-m, --message [message]", description: "Message" }] },
        {
            name: "deploy",
            description: "Deploy",
            command: { cmd: "deploy" },
            options: [
                { flags: "--env <env>", choices: ["stage", "prod"] },
                { flags: "--force", description: "Force" },
                { flags: "--file <file>", type: "path" },
            ],
        },
    ]),
    "commands.json"
);
const builtins = [{ value: "list", description: "List" }];
const values = (words: string[]) => completionCandidates(words, commands, builtins).map(({ value }) => value);

describe("wordsFromLine", () => {
    test("keeps the words after alfred", () => {
        expect(wordsFromLine("alfred ")).toEqual([""]);
        expect(wordsFromLine("alfred git:em")).toEqual(["git:em"]);
        expect(wordsFromLine("cd x && /usr/local/bin/alfred deploy --env ")).toEqual(["deploy", "--env", ""]);
    });
});

describe("completionCandidates", () => {
    test("commands then builtins", () => {
        expect(values([""])).toEqual(["git:empty-commit", "deploy", "list"]);
        expect(values(["--"])).toEqual(["--help", "--version"]);
    });
    test("options not used yet", () => {
        expect(values(["deploy", ""])).toEqual(["--env", "--force", "--file", "--help"]);
        expect(values(["deploy", "--force", ""])).toEqual(["--env", "--file", "--help"]);
    });
    test("option choices", () => {
        expect(values(["deploy", "--env", ""])).toEqual(["stage", "prod"]);
    });
    test("nothing for free values, so the shell completes files", () => {
        expect(values(["deploy", "--file", ""])).toEqual([]);
    });
    test("shells for completion", () => {
        expect(values(["completion", ""])).toEqual(["zsh", "bash", "fish"]);
    });
});

describe("formatCandidates", () => {
    const candidates = completionCandidates([""], commands, builtins);
    test("zsh escapes colons", () => {
        expect(formatCandidates("zsh", candidates, "").split("\n")[0]).toBe("git\\:empty-commit:Empty commit");
    });
    test("bash filters by prefix", () => {
        expect(formatCandidates("bash", candidates, "git:")).toBe("git:empty-commit");
    });
    test("fish uses tabs", () => {
        expect(formatCandidates("fish", candidates, "").split("\n")[1]).toBe("deploy\tDeploy");
    });
});
