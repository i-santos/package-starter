"use strict";

const { loadProject, readHeartbeats } = require("../core/project");
const { readEvents } = require("../core/event-bus");
const { readTaskRecord } = require("@i-santos/workflow");
const { resolveTaskAssignment } = require("../core/agent-profiles");

function summarizeRecentEvent(event) {
  if (!event) {
    return null;
  }
  if (event.event === "TASK_REENQUEUED") {
    return `re-enqueued (${event.source || "unknown"})`;
  }
  if (event.event === "TASK_WORKFLOW_AUTO_ADVANCED") {
    return `workflow -> ${event.workflow_status || "-"}`;
  }
  if (event.event === "TASK_WORKFLOW_REWORK_REQUIRED") {
    return `rework -> ${event.workflow_status || "-"}`;
  }
  if (event.event === "TASK_UNBLOCKED") {
    return "manual unblock";
  }
  if (event.event === "TASK_RETRIED") {
    return "manual retry";
  }
  if (event.event === "TASK_DONE_MANUAL") {
    return "manual done";
  }
  if (event.event === "TASK_BLOCKED") {
    return "blocked";
  }
  if (event.event === "TASK_COMPLETED") {
    return "completed";
  }
  if (event.event === "TASK_STARTED") {
    return "started";
  }
  if (event.event === "TASK_CLAIMED") {
    return `claimed (${event.enqueue_source || "unknown"})`;
  }
  return event.event.toLowerCase();
}

async function runStatus() {
  const project = await loadProject(process.cwd());
  const heartbeats = await readHeartbeats(project);
  const events = await readEvents(project);
  const activeAgents = new Set(heartbeats.map((heartbeat) => heartbeat.agent));

  const counts = new Map();
  let autoReenqueued = 0;
  let manualInterventions = 0;
  const recentEventByTask = new Map();

  for (const event of events) {
    if (event.event === "TASK_REENQUEUED" && event.source === "auto") {
      autoReenqueued += 1;
    }
    if (["TASK_RETRIED", "TASK_UNBLOCKED", "TASK_DONE_MANUAL", "TASK_REENQUEUED"].includes(event.event)) {
      if (event.event !== "TASK_REENQUEUED" || event.source === "manual") {
        manualInterventions += 1;
      }
    }
    if (event.task_id) {
      recentEventByTask.set(event.task_id, event);
    }
  }

  for (const task of project.graph.tasks) {
    counts.set(task.status, (counts.get(task.status) || 0) + 1);
  }

  console.log("Summary");
  for (const status of ["todo", "claimed", "running", "review", "done", "failed", "blocked", "retry_wait", "cancelled"]) {
    if (counts.has(status)) {
      console.log(`- ${status}: ${counts.get(status)}`);
    }
  }
  console.log(`- waiting_human: ${project.graph.tasks.filter((task) => ["blocked", "review"].includes(task.status)).length}`);
  console.log(`- auto_reenqueued: ${autoReenqueued}`);
  console.log(`- manual_interventions: ${manualInterventions}`);

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
    const recentEvent = recentEventByTask.get(task.id) || null;
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
    if (execution.last_workflow_action) {
      console.log(`  workflow: ${execution.last_workflow_action} -> ${execution.last_workflow_status || workflow.status}`);
    }
    if (Array.isArray(execution.last_blockers) && execution.last_blockers.length > 0) {
      console.log(`  blockers: ${execution.last_blockers.join(" | ")}`);
    }
    if (Array.isArray(execution.last_next_actions) && execution.last_next_actions.length > 0) {
      console.log(`  next_actions: ${execution.last_next_actions.join(" | ")}`);
    }
    if (execution.last_workflow_reason) {
      console.log(`  reason: ${execution.last_workflow_reason}`);
    }
    if (execution.last_recommended_action) {
      console.log(`  next: ${execution.last_recommended_action}`);
    }
    if (execution.last_enqueue_source || execution.last_enqueue_reason) {
      console.log(`  queue: ${(execution.last_enqueue_source || "-")} | ${execution.last_enqueue_reason || "-"}`);
    }
    if (recentEvent) {
      console.log(`  activity: ${summarizeRecentEvent(recentEvent)} @ ${recentEvent.timestamp}`);
    }
  }

  console.log("");
  console.log(`Active agents: ${activeAgents.size}`);
}

module.exports = {
  runStatus,
};
