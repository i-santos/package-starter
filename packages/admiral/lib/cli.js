"use strict";

const { runInit } = require("./commands/init");
const { runTaskCreate, runTaskList, runTaskRetry } = require("./commands/task");
const { runStatus } = require("./commands/status");
const { runRun } = require("./commands/run");
const { runCleanup } = require("./commands/cleanup");
const { runMerge } = require("./commands/merge");

function parseFlags(args) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex >= 0) {
      flags[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[trimmed] = next;
      index += 1;
    } else {
      flags[trimmed] = true;
    }
  }

  return { positionals, flags };
}

function printHelp() {
  console.log(`admiral

Usage:
  admiral init
  admiral run [--once]
  admiral status
  admiral task create <id> [--title "..."] [--scope backend] [--priority 1] [--depends-on a,b]
  admiral task list
  admiral task retry <id>
  admiral merge <id>
  admiral cleanup [task-id]
`);
}

async function main(argv) {
  const { positionals, flags } = parseFlags(argv);
  const [command, subcommand, ...rest] = positionals;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "init") {
    await runInit(flags);
    return;
  }

  if (command === "run") {
    await runRun(flags);
    return;
  }

  if (command === "status") {
    await runStatus(flags);
    return;
  }

  if (command === "cleanup") {
    await runCleanup(subcommand);
    return;
  }

  if (command === "merge") {
    if (!subcommand) {
      throw new Error("merge requires a task id");
    }
    await runMerge(subcommand);
    return;
  }

  if (command === "task") {
    if (subcommand === "create") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task create requires an id");
      }
      await runTaskCreate(taskId, flags);
      return;
    }

    if (subcommand === "list") {
      await runTaskList(flags);
      return;
    }

    if (subcommand === "retry") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task retry requires an id");
      }
      await runTaskRetry(taskId);
      return;
    }
  }

  throw new Error(`unknown command: ${argv.join(" ")}`);
}

module.exports = {
  main,
  parseFlags,
};
