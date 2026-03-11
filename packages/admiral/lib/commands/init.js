"use strict";

const path = require("node:path");
const { writeFile } = require("node:fs/promises");
const { ensureDir, pathExists, writeJson } = require("../utils/fs");
const { ensureGitRepository, getRepoRoot } = require("../utils/git");
const { defaultConfig, emptyBoard, emptyGraph } = require("../core/state");

async function runInit(flags = {}) {
  await ensureGitRepository(process.cwd(), flags);
  const repoRoot = await getRepoRoot(process.cwd());

  const directories = [
    ".admiral",
    path.join(".admiral", "locks"),
    "kanban",
    "workspaces",
    "logs",
    path.join("logs", "agents"),
    "events",
    "runtime",
    path.join("runtime", "heartbeats"),
    path.join("runtime", "pids"),
  ];

  for (const relativeDir of directories) {
    await ensureDir(path.join(repoRoot, relativeDir));
  }

  const configPath = path.join(repoRoot, ".admiral", "config.json");
  const graphPath = path.join(repoRoot, "kanban", "graph.json");
  const boardPath = path.join(repoRoot, "kanban", "board.json");
  const eventsPath = path.join(repoRoot, "events", "events.log");

  if (!(await pathExists(configPath))) {
    await writeJson(configPath, defaultConfig());
  }

  if (!(await pathExists(graphPath))) {
    await writeJson(graphPath, emptyGraph());
  }

  if (!(await pathExists(boardPath))) {
    await writeJson(boardPath, emptyBoard());
  }

  if (!(await pathExists(eventsPath))) {
    await writeFile(eventsPath, "", "utf8");
  }

  console.log(`Initialized admiral in ${repoRoot}`);
}

module.exports = {
  runInit,
};
