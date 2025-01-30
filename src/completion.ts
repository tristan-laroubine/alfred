import alfredCommands from "../commands.json";
import { AlfredCommandSchema, computeAlfredCommandsSchema } from "./alfredCommandSchema";
import { install, log } from "tabtab";

const commands = computeAlfredCommandsSchema(alfredCommands);
log(commands.map((command) => 
    command.name)
);

install({
    name: "alfred",
    completer: "alfred",
    postInstallMessage: "Don't forget to restart your shell",
});

