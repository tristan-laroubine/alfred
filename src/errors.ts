import pc from "picocolors";

export class AlfredError extends Error {
    readonly hint?: string;
    readonly exitCode: number;

    constructor(message: string, { hint, exitCode = 1 }: { hint?: string; exitCode?: number } = {}) {
        super(message);
        this.name = "AlfredError";
        this.hint = hint;
        this.exitCode = exitCode;
    }
}

export class ConfigError extends AlfredError {
    constructor(
        message: string,
        readonly details: string[] = [],
        readonly reason: "not-found" | "invalid" = "invalid"
    ) {
        super(message, {
            hint:
                reason === "not-found"
                    ? `Run ${pc.bold("alfred init")} to create it.`
                    : `Run ${pc.bold("alfred edit")} to fix it, see the README for the format.`,
        });
        this.name = "ConfigError";
    }
}

export function printError(error: unknown): number {
    if (error instanceof AlfredError) {
        console.error(`${pc.red("✖")} ${error.message}`);
        if (error instanceof ConfigError) {
            for (const detail of error.details) {
                console.error(`  ${pc.dim("•")} ${detail}`);
            }
        }
        if (error.hint) {
            console.error(`  ${pc.dim(error.hint)}`);
        }
        return error.exitCode;
    }
    // Ctrl+C in an @inquirer prompt
    if (error instanceof Error && error.name === "ExitPromptError") {
        return 130;
    }
    console.error(error);
    return 1;
}
