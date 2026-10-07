import path from "node:path";
import confirm from "@inquirer/confirm";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { InvalidArgumentError, Option } from "commander";
import pc from "picocolors";
import { expandHome } from "./config";
import type { CommandOption } from "./schema";

function parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "on"].includes(normalized)) {
        return true;
    }
    if (["false", "no", "n", "0", "off"].includes(normalized)) {
        return false;
    }
    throw new InvalidArgumentError("Expected true or false.");
}

const PARSERS: Record<NonNullable<CommandOption["type"]>, ((value: string) => unknown) | undefined> = {
    string: undefined,
    number: (value) => {
        const number = Number(value);
        if (value.trim() === "" || Number.isNaN(number)) {
            throw new InvalidArgumentError("Expected a number.");
        }
        return number;
    },
    boolean: parseBoolean,
    url: (value) => {
        try {
            return new URL(value).toString();
        } catch {
            throw new InvalidArgumentError("Expected a valid URL.");
        }
    },
    path: (value) => path.resolve(expandHome(value)),
};

export function createOption(definition: CommandOption): Option {
    const { flags, description, required, defaultValue, choices, envVar, type } = definition;
    const option = new Option(flags, description);
    if (required) {
        option.makeOptionMandatory();
    }
    if (defaultValue !== undefined) {
        option.default(defaultValue);
        if (option.optional) {
            // `--name` without value uses the default value
            option.preset(defaultValue);
        }
    }
    if (envVar) {
        option.env(envVar);
    }
    if (choices) {
        option.choices(choices);
    } else if (type && PARSERS[type]) {
        option.argParser(PARSERS[type]);
    }
    return option;
}

/**
 * Ask for each option value, used when the command is picked from the menu.
 * Returns the matching command line arguments.
 */
export async function promptOptions(definitions: CommandOption[]): Promise<string[]> {
    const args: string[] = [];
    for (const definition of definitions) {
        const option = new Option(definition.flags);
        const flag = option.long ?? option.short!;
        const label = `${pc.bold(flag)}${definition.description ? pc.dim(` ${definition.description}`) : ""}`;
        const envDefault = definition.envVar ? process.env[definition.envVar] : undefined;
        const defaultValue = envDefault ?? definition.defaultValue;
        const takesValue = option.required || option.optional;

        if (!takesValue) {
            if (await confirm({ message: label, default: false })) {
                args.push(flag);
            }
            continue;
        }

        let value: string | undefined;
        if (definition.choices?.length) {
            const skip = "\0skip";
            const answer = await select({
                message: label,
                choices: [
                    ...definition.choices.map((choice) => ({ value: choice, name: choice })),
                    ...(definition.required ? [] : [{ value: skip, name: pc.dim("(none)") }]),
                ],
                default: typeof defaultValue === "string" ? defaultValue : undefined,
            });
            value = answer === skip ? undefined : answer;
        } else if (definition.type === "boolean") {
            value = String(await confirm({ message: label, default: String(defaultValue) === "true" }));
        } else {
            const parser = definition.type ? PARSERS[definition.type] : undefined;
            value = await input({
                message: label,
                default: defaultValue === undefined ? undefined : String(defaultValue),
                required: definition.required,
                validate: (text) => {
                    if (!text || !parser) {
                        return true;
                    }
                    try {
                        parser(text);
                        return true;
                    } catch (error) {
                        return (error as Error).message;
                    }
                },
            });
        }
        if (value !== undefined && value !== "") {
            args.push(flag, value);
        }
    }
    return args;
}
