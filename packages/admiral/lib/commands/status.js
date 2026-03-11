"use strict";

const { loadProject, readHeartbeats } = require("../core/project");

async function runStatus() {
  const project = await loadProject(process.cwd());
  const heartbeats = await readHeartbeats(project);
  const activeAgents = new Set(heartbeats.map((heartbeat) => heartbeat.agent));

  const counts = new Map();
  for (const task of project.graph.tasks) {
    counts.set(task.status, (counts.get(task.status) || 0) + 1);
  }

  console.log("Summary");
  for (const status of ["todo", "claimed", "running", "review", "done", "failed", "blocked", "retry_wait", "cancelled"]) {
    if (counts.has(status)) {
      console.log(`- ${status}: ${counts.get(status)}`);
    }
  }

  console.log("");
  console.log("Tasks");
  if (project.graph.tasks.length === 0) {
    console.log("No tasks.");
    return;
  }

  for (const task of project.graph.tasks) {
    console.log([
      task.id.padEnd(20, " "),
      task.status.padEnd(12, " "),
      String(task.agent || "-").padEnd(18, " "),
      String(task.workspace || "-"),
    ].join(" "));
  }

  console.log("");
  console.log(`Active agents: ${activeAgents.size}`);
}

module.exports = {
  runStatus,
};
