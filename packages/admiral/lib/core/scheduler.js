"use strict";

const { reloadGraph, withGraphMutation, saveBoard } = require("./project");
const { appendEvent } = require("./event-bus");
const { getReadyTasks, validateGraphIntegrity } = require("./task-graph");
const { ensureWorkspace } = require("./workspace-manager");
const { spawnTaskWorker } = require("./agent-runner");
const { runRecovery } = require("./recovery");
const { sleep } = require("../utils/time");

async function claimReadyTasks(project) {
  const availableSlots = Math.max(0, project.config.max_agents - project.graph.tasks.filter((task) => ["claimed", "running"].includes(task.status)).length);
  if (availableSlots <= 0) {
    return 0;
  }

  const ready = getReadyTasks(project.graph).slice(0, availableSlots);
  if (ready.length === 0) {
    return 0;
  }

  let claimedCount = 0;
  const claimedTaskIds = [];
  await withGraphMutation(project, async (graph) => {
    validateGraphIntegrity(graph);
    const freshReady = getReadyTasks(graph).slice(0, availableSlots);
    for (const task of freshReady) {
      const agentId = `agent-${task.id}`;
      const workspaceInfo = await ensureWorkspace(project, task);
      task.status = "claimed";
      task.agent = agentId;
      task.branch = workspaceInfo.branch;
      task.workspace = workspaceInfo.workspace;
      await appendEvent(project, "TASK_CLAIMED", task.id, agentId, {
        workspace: workspaceInfo.workspace,
        branch: workspaceInfo.branch,
      });
      claimedTaskIds.push(task.id);
      claimedCount += 1;
    }
    return graph;
  });

  project.graph = await reloadGraph(project);
  for (const task of project.graph.tasks.filter((item) => claimedTaskIds.includes(item.id))) {
    const pid = await spawnTaskWorker(project, task);
    await appendEvent(project, "TASK_STARTED", task.id, task.agent, { pid });
  }

  return claimedCount;
}

async function runScheduler(project, options = {}) {
  await runRecovery(project);
  let keepRunning = true;

  const stop = () => {
    keepRunning = false;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    await reloadGraph(project);
    await claimReadyTasks(project);
    await saveBoard(project);

    if (options.once) {
      break;
    }

    await sleep(project.config.scheduler_interval_ms);
  } while (keepRunning);
}

module.exports = {
  runScheduler,
};
