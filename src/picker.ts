import search from "@inquirer/search";
import pc from "picocolors";
import { tildify, expandHome } from "./config";
import type { AlfredCommand } from "./schema";

/**
 * Higher is better, undefined when the query doesn't match.
 * Matches the name as a substring first, then as a subsequence ("gec" -> "git:empty-commit"),
 * then the description.
 */
export function matchScore(command: AlfredCommand, query: string): number | undefined {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return 0;
    }
    const name = command.name.toLowerCase();
    const index = name.indexOf(needle);
    if (index !== -1) {
        return 1000 - index * 10 - (name.length - needle.length);
    }
    let position = -1;
    let gaps = 0;
    for (const char of needle) {
        const next = name.indexOf(char, position + 1);
        if (next === -1) {
            position = -1;
            break;
        }
        gaps += next - position - 1;
        position = next;
    }
    if (position !== -1) {
        return 500 - gaps;
    }
    if (command.description.toLowerCase().includes(needle)) {
        return 100;
    }
    return undefined;
}

export function filterCommands(commands: AlfredCommand[], query: string): AlfredCommand[] {
    return commands
        .map((command) => ({ command, score: matchScore(command, query) }))
        .filter((entry): entry is { command: AlfredCommand; score: number } => entry.score !== undefined)
        .sort((a, b) => b.score - a.score)
        .map(({ command }) => command);
}

function preview(command: AlfredCommand): string {
    const maxLength = Math.max(40, (process.stdout.columns || 80) * 2 - 10);
    const cmd = command.command.cmd.length > maxLength ? command.command.cmd.slice(0, maxLength - 1) + "…" : command.command.cmd;
    const dir = command.command.dir ? `${tildify(expandHome(command.command.dir))} ` : "";
    return pc.dim(`${dir}$ ${cmd}`);
}

export async function pickCommand(commands: AlfredCommand[]): Promise<AlfredCommand> {
    const width = Math.min(Math.max(...commands.map((command) => command.name.length)), 30);
    return search({
        message: "Which command?",
        pageSize: 15,
        source: (term) =>
            filterCommands(commands, term ?? "").map((command) => ({
                value: command,
                short: command.name,
                name: `${command.name.padEnd(width)}  ${pc.dim(command.description)}`,
                description: preview(command),
            })),
    });
}
