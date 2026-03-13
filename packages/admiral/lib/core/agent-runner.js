"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { writeJson } = require("../utils/fs");

async function spawnTaskWorker(project, task) {
  const workerPath = path.join(__dirname, "worker.js");
  const child = spawn(process.execPath, [workerPath, project.root, task.id], {
    cwd: project.root,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  await writeJson(path.join(project.paths.runtimePidsDir, `${task.id}.json`), {
    task_id: task.id,
    agent: task.agent,
    pid: child.pid,
    started_at: new Date().toISOString(),
  });

  return child.pid;
}

module.exports = {
  spawnTaskWorker,
};
