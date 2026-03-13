"use strict";

const { runScheduler } = require("../core/scheduler");
const { loadProject } = require("../core/project");

async function runRun(flags = {}) {
  const project = await loadProject(process.cwd());
  const once = Boolean(flags.once);
  const taskId = typeof flags["task-id"] === "string" ? flags["task-id"] : null;
  await runScheduler(project, { once, taskId });
}

module.exports = {
  runRun,
};
