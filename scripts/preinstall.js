#!/usr/bin/env node

const { execSync } = require("child_process");

function checkBun() {
  try {
    const version = execSync("bun --version", { stdio: "pipe" })
      .toString()
      .trim();

    console.log(`✔ Bun is installed (version ${version}).`);
  } catch (err) {
    console.error("❌ Bun is not installed on this system.\n");
    console.error("Please install Bun from https://bun.sh");
    console.error("Aborting installation.");
    process.exit(1);
  }
}

checkBun();
