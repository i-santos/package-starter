"use strict";

const path = require("node:path");
const { reloadGraph, withGraphMutation, readHeartbeats, readPidRecords, saveBoard } = require("./project");
const { appendEvent } = require("./event-bus");
const { applyRetry } = require("./retry-policy");
const { removeFileIfExists } = require("../utils/fs");
const { isProcessAlive } = require("../utils/process");
const { removeWorkspaceForTask } = require("./workspace-manager");

async function runRecovery(project) {
  await reloadGraph(project);
  const [heartbeats, pidRecords] = await Promise.all([
    readHeartbeats(project),
    readPidRecords(project),
  ]);
  const heartbeatMap = new Map(heartbeats.map((heartbeat) => [heartbeat.task_id, heartbeat]));
  const pidMap = new Map(pidRecords.map((record) => [record.task_id, record]));
  const staleTasks = [];

  await withGraphMutation(project, async (graph) => {
    for (const task of graph.tasks) {
      if (!["claimed", "running"].includes(task.status)) {
        continue;
      }

      const pidRecord = pidMap.get(task.id);
      const heartbeat = heartbeatMap.get(task.id);
      const alive = pidRecord ? isProcessAlive(pidRecord.pid) : false;
      const heartbeatAlive = heartbeat
        ? Date.now() - Date.parse(heartbeat.updated_at) <= project.config.heartbeat_timeout_ms
        : false;

      if (alive && heartbeatAlive) {
        continue;
      }

      const previousAgent = task.agent;
      const previousWorkspace = task.workspace;
      applyRetry(task, project.config);
      await appendEvent(project, "AGENT_DEAD", task.id, previousAgent, {
        pid: pidRecord ? pidRecord.pid : null,
        workspace: previousWorkspace,
      });
      await removeFileIfExists(path.join(project.paths.runtimePidsDir, `${task.id}.json`));
      staleTasks.push({
        id: task.id,
        workspace: previousWorkspace,
      });
    }

    for (const task of graph.tasks) {
      if (task.status === "retry_wait") {
        task.status = "todo";
      }
    }

    return graph;
  });

  for (const staleTask of staleTasks) {
    await removeWorkspaceForTask(project, staleTask);
  }

  await saveBoard(project);
}

module.exports = {
  runRecovery,
};
