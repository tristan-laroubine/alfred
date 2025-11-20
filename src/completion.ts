import { AlfredCommandSchema, computeAlfredCommandsSchema } from "./alfredCommandSchema";
import { install, log } from "tabtab";
import { getCommandsCache, interactiveInitCache } from "./localCache";

export async function installCompletion(){
    await interactiveInitCache();

   await install({
        name: "alfred",
        completer: "alfred",
    });
}