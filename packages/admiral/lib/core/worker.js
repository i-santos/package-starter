"use strict";

const path = require("node:path");
const { setInterval, clearInterval } = require("node:timers");
const { loadProject, withGraphMutation, reloadGraph, saveBoard } = require("./project");
const { getTaskById } = require("./task-graph");
const { appendEvent } = require("./event-bus");
const { writeHeartbeat, clearHeartbeat } = require("./heartbeat");
const { applyRetry } = require("./retry-policy");
const { execShellCommand } = require("../utils/process");
const { removeFileIfExists, appendText } = require("../utils/fs");

async function runTaskCommand(project, task) {
  const logPath = path.join(project.paths.agentLogsDir, `${task.id}.log`);
  const env = {
    ...process.env,
    ADMIRAL_ROOT: project.root,
    ADMIRAL_TASK_ID: task.id,
    ADMIRAL_TASK_TITLE: task.title,
    ADMIRAL_TASK_SCOPE: task.scope,
    ADMIRAL_TASK_BRANCH: task.branch || "",
    ADMIRAL_TASK_WORKSPACE: task.workspace || "",
  };

  if (task.hooks && task.hooks["pre-run"]) {
    await execShellCommand(task.hooks["pre-run"], {
      cwd: task.workspace || project.root,
      env,
    });
  }

  const result = await execShellCommand(project.config.agent_command, {
    cwd: task.workspace || project.root,
    env,
    allowFailure: true,
  });

  if (result.stdout) {
    await appendText(logPath, result.stdout);
  }
  if (result.stderr) {
    await appendText(logPath, result.stderr);
  }

  if (result.code !== 0) {
    throw new Error(`agent command failed with code ${result.code}`);
  }

  if (task.hooks && task.hooks["post-run"]) {
    await execShellCommand(task.hooks["post-run"], {
      cwd: task.workspace || project.root,
      env,
    });
  }
}

async function main() {
  const [repoRoot, taskId] = process.argv.slice(2);
  if (!repoRoot || !taskId) {
    throw new Error("worker requires <repo-root> <task-id>");
  }

  process.chdir(repoRoot);
  const project = await loadProject(repoRoot);
  let task = getTaskById(project.graph, taskId);

  await withGraphMutation(project, (graph) => {
    const freshTask = getTaskById(graph, taskId);
    freshTask.status = "running";
    return graph;
  });
  await reloadGraph(project);
  task = getTaskById(project.graph, taskId);

  const heartbeatTick = async () => {
    await writeHeartbeat(project, {
      agent: task.agent,
      task_id: task.id,
      status: "running",
    });
  };

  await heartbeatTick();
  const interval = setInterval(() => {
    heartbeatTick().catch(() => {});
  }, Math.max(1000, Math.floor(project.config.heartbeat_timeout_ms / 3)));

  try {
    await runTaskCommand(project, task);
    await withGraphMutation(project, (graph) => {
      const freshTask = getTaskById(graph, taskId);
      freshTask.status = "review";
      return graph;
    });
    await appendEvent(project, "TASK_DONE", taskId, task.agent);
  } catch (error) {
    await withGraphMutation(project, (graph) => {
      const freshTask = getTaskById(graph, taskId);
      applyRetry(freshTask, project.config);
      return graph;
    });
    await appendEvent(project, "TASK_FAILED", taskId, task.agent, {
      error: error.message,
    });
    process.exitCode = 1;
  } finally {
    clearInterval(interval);
    await clearHeartbeat(project, task.agent);
    await removeFileIfExists(path.join(project.paths.runtimePidsDir, `${task.id}.json`));
    await saveBoard(project);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
