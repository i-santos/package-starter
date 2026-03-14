"use strict";

const { reloadGraph, withGraphMutation, saveBoard } = require("./project");
const { appendEvent } = require("./event-bus");
const { getReadyTasks, getTaskById, validateGraphIntegrity } = require("./task-graph");
const { ensureWorkspace } = require("./workspace-manager");
const { spawnTaskWorker } = require("./agent-runner");
const { runRecovery } = require("./recovery");
const { sleep } = require("../utils/time");

async function defaultStartTaskWorker(project, task) {
  const pid = await spawnTaskWorker(project, task);
  await appendEvent(project, "TASK_STARTED", task.id, task.agent, { pid });
  return pid;
}

async function claimReadyTasks(project, options = {}, deps = {}) {
  const ensureTaskWorkspace = typeof deps.ensureWorkspace === "function" ? deps.ensureWorkspace : ensureWorkspace;
  const startTaskWorker = typeof deps.startTaskWorker === "function" ? deps.startTaskWorker : defaultStartTaskWorker;
  const availableSlots = Math.max(0, project.config.max_agents - project.graph.tasks.filter((task) => ["claimed", "running"].includes(task.status)).length);
  if (availableSlots <= 0) {
    return 0;
  }

  let ready = getReadyTasks(project.graph);
  if (options.taskId) {
    const requestedTask = getTaskById(project.graph, options.taskId);
    ready = ready.filter((task) => task.id === requestedTask.id);
    if (ready.length === 0) {
      throw new Error(`task ${options.taskId} is not ready to run`);
    }
  }
  ready = ready.slice(0, availableSlots);
  if (ready.length === 0) {
    return 0;
  }

  let claimedCount = 0;
  const claimedTaskIds = [];
  await withGraphMutation(project, async (graph) => {
    validateGraphIntegrity(graph);
    let freshReady = getReadyTasks(graph);
    if (options.taskId) {
      freshReady = freshReady.filter((task) => task.id === options.taskId);
      if (freshReady.length === 0) {
        throw new Error(`task ${options.taskId} is not ready to run`);
      }
    }
    freshReady = freshReady.slice(0, availableSlots);
    for (const task of freshReady) {
      const agentId = `agent-${task.id}`;
      const workspaceInfo = await ensureTaskWorkspace(project, task);
      task.status = "claimed";
      task.agent = agentId;
      task.branch = workspaceInfo.branch;
      task.workspace = workspaceInfo.workspace;
      await appendEvent(project, "TASK_CLAIMED", task.id, agentId, {
        workspace: workspaceInfo.workspace,
        branch: workspaceInfo.branch,
        enqueue_source: task.metadata && task.metadata.execution ? task.metadata.execution.last_enqueue_source || null : null,
        enqueue_reason: task.metadata && task.metadata.execution ? task.metadata.execution.last_enqueue_reason || null : null,
      });
      claimedTaskIds.push(task.id);
      claimedCount += 1;
    }
    return graph;
  });

  project.graph = await reloadGraph(project);
  for (const task of project.graph.tasks.filter((item) => claimedTaskIds.includes(item.id))) {
    await startTaskWorker(project, task);
  }

  return claimedCount;
}

async function runScheduler(project, options = {}, deps = {}) {
  const sleepFor = typeof deps.sleep === "function" ? deps.sleep : sleep;
  await runRecovery(project, deps);
  let keepRunning = true;

  const stop = () => {
    keepRunning = false;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    await reloadGraph(project);
    await claimReadyTasks(project, options, deps);
    await saveBoard(project);

    if (options.once) {
      break;
    }

    await sleepFor(project.config.scheduler_interval_ms);
  } while (keepRunning);
}

module.exports = {
  runScheduler,
  claimReadyTasks,
};
