
import { merge } from "lodash";
import { z } from "zod";

export const AlfredCommandSchema = z.object({
    name: z.string().min(1, { message: "Command Name is required" }),
    description: z.string(),
    command: z.object({
        dir: z.string().optional(),
        cmd: z.string().min(1, { message: "Command is required" }),
    }).strict(),
    config: z
        .object({
            confirm: z.boolean().optional(),
        })
        .strict()
        .optional(),
    extends: z.string().optional(),
    options: z.array(
            z.object({
                flags: z.string(),
                description: z.string(),
                required: z.boolean().optional(),
                defaultValue: z.any().optional(),
                envVar: z.string().optional(),
                choices: z.array(z.string()).optional(),
                type: z.enum(["number", "string", "boolean", "url", "path"]).optional(),
            }).strict()
        )
        .optional()
        .default([]),
}).strict();
export const ExtendedAlfredCommandSchema = AlfredCommandSchema.extend({
    extends: z.string(),
}).deepPartial();

export const AlfredCommandsSchema = z.array(
    z.union([AlfredCommandSchema, ExtendedAlfredCommandSchema])
).superRefine((commands, ctx) => {
    const commandNames = commands.map((cmd) => cmd.name);
    commands.forEach((cmd, index) => {
        if ("extends" in cmd) {
            if (!commandNames.includes(cmd.extends ?? "")) {
                ctx.addIssue({
                    path: [index, "extends"],
                    message: `Alfred Command "${cmd.extends}" unknown`,
                    fatal: true,
                    code: "custom",
                });
            }
        }
    });
});

export type AlfredCommands = z.infer<typeof AlfredCommandsSchema>;
export type AlfredCommand = z.infer<typeof AlfredCommandSchema>;

export function computeAlfredCommandsSchema(commands): AlfredCommands {
    return AlfredCommandsSchema.parse(commands).map((command) => {
        const isExtends = "extends" in command;
        if (isExtends) {
            const parentCommand = commands.find(
                (cmd) => cmd.name === command.extends
            );
            if (!parentCommand) {
                throw new Error(`Illegal state error`);
            }
            if (command?.command?.cmd) {
                command.command.cmd = command.command.cmd.replace("{super}", parentCommand?.command?.cmd ?? "");
            }
            command = merge({}, parentCommand, command) as AlfredCommand;
        }
        const safeCommand = AlfredCommandSchema.parse(command);
        return safeCommand;
    });
}
