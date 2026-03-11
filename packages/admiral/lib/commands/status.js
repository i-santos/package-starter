"use strict";

const { loadProject, readHeartbeats } = require("../core/project");
const { readTaskRecord } = require("@i-santos/workflow");
const { resolveTaskAssignment } = require("../core/agent-profiles");

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
    const workflow = readTaskRecord(task);
    const execution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
    const assignment = resolveTaskAssignment(project, task);
    console.log([
      task.id.padEnd(20, " "),
      task.status.padEnd(12, " "),
      workflow.status.padEnd(14, " "),
      assignment.resolvedProfile.name.padEnd(12, " "),
      String(task.agent || "-").padEnd(18, " "),
      String(task.workspace || "-"),
    ].join(" "));
    if (execution.last_summary) {
      console.log(`  summary: ${execution.last_summary}`);
    }
    if (Array.isArray(execution.last_blockers) && execution.last_blockers.length > 0) {
      console.log(`  blockers: ${execution.last_blockers.join(" | ")}`);
    }
    if (Array.isArray(execution.last_next_actions) && execution.last_next_actions.length > 0) {
      console.log(`  next_actions: ${execution.last_next_actions.join(" | ")}`);
    }
  }

  console.log("");
  console.log(`Active agents: ${activeAgents.size}`);
}

module.exports = {
  runStatus,
};
