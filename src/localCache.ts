import { promises as fs } from 'fs';
import { name } from '../package.json';
import envPaths from 'env-paths';
import prompts from 'prompts';

export function getLocalCacheFilesPath(){
    const paths = envPaths(name);
    return {
        commands: `${paths.cache}/commands.json`,
        settings: `${paths.cache}/settings.json`,
    };
}

export async function clearLocalCache(): Promise<void> {
    const { commands, settings } = getLocalCacheFilesPath();
    await Promise.allSettled([
        fs.unlink(commands),
        fs.unlink(settings),
    ]);
}

export async function initCacheFiles(): Promise<void> {
    const { commands, settings } = getLocalCacheFilesPath();
    await fs.mkdir(`${envPaths(name).cache}`, { recursive: true });
    try {
        await fs.access(commands);
    } catch {
        const exampleCommands = await import('../assets/example.commands.json');
        await fs.writeFile(commands, JSON.stringify(exampleCommands.default, null, 2));
    }
    try {
        await fs.access(settings);
    } catch {
        await fs.writeFile(settings, JSON.stringify({}));
    }
}

export async function getCommandsCache(interactiveInit: boolean = false): Promise<unknown> {
    try {
        const { commands } = getLocalCacheFilesPath();
        const data = await fs.readFile(commands, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (interactiveInit) {
            await interactiveInitCache();
            return getCommandsCache(false);
        }
        throw error;
    }
}

export async function interactiveInitCache(): Promise<void> {
    try {
        const { commands } = getLocalCacheFilesPath();
        await fs.access(commands);
        console.log('✅ Local cache found, no need to initialize.');
        return;
    } catch {
    }
    const response = await prompts({
        type: "confirm",
        name: "value",
        message: "No local cache found. Do you want to initialize it with example commands?",
        initial: true
    });
    if (response.value) {
        await initCacheFiles();
        console.log('✅ Local cache initialized with example commands.');
        console.log('You can find the commands file at:', getLocalCacheFilesPath().commands);
    } else {
        console.log('❌ Local cache initialization canceled.');
        process.exit(0);
    }
}

