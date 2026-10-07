import { expect, test } from "bun:test";
import { parseCommands } from "./config";
import { filterCommands } from "./picker";

const { commands } = parseCommands(
    JSON.stringify(
        ["cloud", "cloud:stage", "git:empty-commit", "mobi:stage"].map((name) => ({
            name,
            description: name === "mobi:stage" ? "Serve the mobile app" : "",
            command: { cmd: "x" },
        }))
    ),
    "commands.json"
);
const names = (query: string) => filterCommands(commands, query).map(({ name }) => name);

test("empty query keeps the file order", () => {
    expect(names("")).toEqual(["cloud", "cloud:stage", "git:empty-commit", "mobi:stage"]);
});
test("substring matches first, best match first", () => {
    expect(names("stage")).toEqual(["mobi:stage", "cloud:stage"]);
    expect(names("cloud")).toEqual(["cloud", "cloud:stage"]);
});
test("fuzzy matches", () => {
    expect(names("gec")).toEqual(["git:empty-commit"]);
});
test("description matches", () => {
    expect(names("mobile")).toEqual(["mobi:stage"]);
});
