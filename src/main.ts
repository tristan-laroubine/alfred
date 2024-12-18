import { Command } from "commander";
import autocomplete from "inquirer-autocomplete-standalone";
import alfredCommands from "../commands.json";
import { $, cd, os } from "zx";

//#region main

async function main(){
    const program = new Command()
    .version('0.0.1')
    .description('Alfred CLI');

alfredCommands.forEach((alfredCommand) => {
    program
        .command(alfredCommand.name)
        .description(alfredCommand.description)
        .action(async () => {
            if (alfredCommand.options?.confirm) {
                const isConfirm = confirm(`Are you sure you want to run this command? ${alfredCommand.name}`);
                if (!isConfirm) {
                    console.log('Command canceled ❌');
                    return;
                }
            }

            if (!Array.isArray(alfredCommand.command)) {
                await execCommand(alfredCommand.command);
                return;
            }
            await Promise.all(alfredCommand.command.map((command) => execCommand(command)));
        });
});
const isEmptyCommand = process.argv.length === 2;
if (isEmptyCommand) {
    const command = await autocomplete({
        message: 'Select a command 🤖  ',
        source: async (input) => {
            return alfredCommands
                .filter((alfredCommand) => alfredCommand.name.includes(input ?? ''))
                .map((alfredCommand) => {
                    return {
                        value: alfredCommand.name,
                        name: `${alfredCommand.name} (${alfredCommand.description})`,
                    };
                });
        }
    });
    await program.parseAsync([process.argv[0], process.argv[1], command]);
} else {
    await program.parseAsync(process.argv);
}
}


main();


async function execCommand(command: {
    cmd: string;
    dir?: string;
},
    options?: {
        child?: boolean;
    }) {
    execRelativeCdCommand(command.dir);
    const script = command.cmd;
    const { stderr, stdout, exitCode } = await $`bash -c ${script}`.nothrow();
    if (exitCode === 0) {
        console.log(stdout.toString());
    } else {
        console.error(stderr.toString());
        console.log(`Exit code: ${exitCode}`);
    }
}
//#endregion


function execRelativeCdCommand(dir: string | undefined | null
): void {
    if (!dir) {
        return;
    }
    const useHomeDir = dir.startsWith('~');
    if (useHomeDir) {
        dir = dir.replace('~', os.homedir());
    }
    cd(dir);
}