"use strict";

const { execFile } = require("./process");

async function getRepoRoot(cwd) {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim();
  } catch {
    throw new Error("admiral must run inside a git repository; run `admiral init` first");
  }
}

async function ensureGitRepository(cwd) {
  try {
    return await getRepoRoot(cwd);
  } catch {
    try {
      await execFile("git", ["init", "-b", "main"], { cwd });
    } catch {
      await execFile("git", ["init"], { cwd });
    }
    await execFile("git", ["add", "."], { cwd }).catch(() => {});
    await execFile("git", ["commit", "-m", "chore: bootstrap admiral repository"], { cwd, allowFailure: true }).catch(() => {});
    return getRepoRoot(cwd);
  }
}

module.exports = {
  getRepoRoot,
  ensureGitRepository,
};
