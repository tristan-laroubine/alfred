import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "alfred-test-home-")));
process.env.HOME = home;
delete process.env.ALFRED_COMMANDS;
delete process.env.XDG_CONFIG_HOME;
delete process.env.XDG_CACHE_HOME;
delete process.env.ZDOTDIR;
process.on("exit", () => fs.rmSync(home, { recursive: true, force: true }));
