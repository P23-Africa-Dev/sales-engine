/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const path = require("node:path");

// On Windows a shell can report the repo root with a lowercase drive letter
// ("c:\..."). Node then resolves @vitest/runner under both that path and its
// uppercase realpath, loading two copies of the module: the worker primes one
// while test files import the other, so every `describe` fails with
// "Cannot read properties of undefined (reading 'config')". Re-launch Vitest
// with the drive letter normalized so both resolutions agree.
const root = path
  .resolve(__dirname, "..")
  .replace(/^([a-z]):/, (_match, drive) => `${drive.toUpperCase()}:`);

const vitestBin = path.join(root, "node_modules", "vitest", "vitest.mjs");

const child = spawn(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
