"use strict";

const { runScheduler } = require("../core/scheduler");
const { loadProject } = require("../core/project");

async function runRun(flags = {}) {
  const project = await loadProject(process.cwd());
  const once = Boolean(flags.once);
  await runScheduler(project, { once });
}

module.exports = {
  runRun,
};
