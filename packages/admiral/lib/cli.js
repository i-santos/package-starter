"use strict";

const { runInit } = require("./commands/init");
const {
  runTaskCreate,
  runTaskList,
  runTaskStatus,
  runTaskHistory,
  runTaskPlan,
  runTaskTdd,
  runTaskImplement,
  runTaskVerify,
  runTaskPublishReady,
  runTaskRetry,
  runTaskUnblock,
  runTaskDone,
} = require("./commands/task");
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
  admiral run [--once] [--task-id <id>]
  admiral status [--json]
  admiral task create <id> [--title "..."] [--scope backend] [--profile implementer] [--priority 1] [--depends-on a,b] [--json]
  admiral task list [--json]
  admiral task status <id> [--json]
  admiral task history <id> [--limit 20] [--json]
  admiral task plan <id> [--json]
  admiral task tdd <id> [--json]
  admiral task implement <id> [--json]
  admiral task verify <id> [--json]
  admiral task publish-ready <id> [--json]
  admiral task retry <id>
  admiral task unblock <id> [--json]
  admiral task done <id> [--json]
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

    if (subcommand === "status") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task status requires an id");
      }
      await runTaskStatus(taskId, flags);
      return;
    }

    if (subcommand === "history") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task history requires an id");
      }
      await runTaskHistory(taskId, flags);
      return;
    }

    if (subcommand === "plan") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task plan requires an id");
      }
      await runTaskPlan(taskId, flags);
      return;
    }

    if (subcommand === "tdd") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task tdd requires an id");
      }
      await runTaskTdd(taskId, flags);
      return;
    }

    if (subcommand === "implement") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task implement requires an id");
      }
      await runTaskImplement(taskId, flags);
      return;
    }

    if (subcommand === "verify") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task verify requires an id");
      }
      await runTaskVerify(taskId, flags);
      return;
    }

    if (subcommand === "publish-ready") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task publish-ready requires an id");
      }
      await runTaskPublishReady(taskId, flags);
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

    if (subcommand === "unblock") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task unblock requires an id");
      }
      await runTaskUnblock(taskId, flags);
      return;
    }

    if (subcommand === "done") {
      const taskId = rest[0];
      if (!taskId) {
        throw new Error("task done requires an id");
      }
      await runTaskDone(taskId, flags);
      return;
    }
  }

  throw new Error(`unknown command: ${argv.join(" ")}`);
}

module.exports = {
  main,
  parseFlags,
};
