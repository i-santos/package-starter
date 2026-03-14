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

function buildTaskStatus(project, task, recentEvent) {
  const workflow = readTaskRecord(task);
  const execution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
  const assignment = resolveTaskAssignment(project, task);
  return {
    id: task.id,
    scheduler_status: task.status,
    workflow_status: workflow.status,
    agent: task.agent || null,
    workspace: task.workspace || null,
    branch: task.branch || null,
    profile: task.profile || "default",
    active_profile: assignment.resolvedProfile.name,
    stage_profile: assignment.stageProfile || null,
    summary: execution.last_summary || null,
    blockers: Array.isArray(execution.last_blockers) ? execution.last_blockers : [],
    next_actions: Array.isArray(execution.last_next_actions) ? execution.last_next_actions : [],
    workflow_action: execution.last_workflow_action || null,
    workflow_reason: execution.last_workflow_reason || null,
    recommended_action: execution.last_recommended_action || null,
    enqueue_source: execution.last_enqueue_source || null,
    enqueue_reason: execution.last_enqueue_reason || null,
    recent_activity: recentEvent
      ? {
          summary: summarizeRecentEvent(recentEvent),
          timestamp: recentEvent.timestamp,
          event: recentEvent.event,
        }
      : null,
  };
}

async function buildStatusPayload(project) {
  const heartbeats = await readHeartbeats(project);
  const events = await readEvents(project);
  const activeAgents = new Set(heartbeats.map((heartbeat) => heartbeat.agent));

  const counts = {};
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
    counts[task.status] = (counts[task.status] || 0) + 1;
  }

  return {
    summary: {
      counts,
      waiting_human: project.graph.tasks.filter((task) => ["blocked", "review"].includes(task.status)).length,
      auto_reenqueued: autoReenqueued,
      manual_interventions: manualInterventions,
      active_agents: activeAgents.size,
    },
    tasks: project.graph.tasks.map((task) => buildTaskStatus(project, task, recentEventByTask.get(task.id) || null)),
  };
}

function writeLine(io, line = "") {
  const writer = io && typeof io.stdout === "function" ? io.stdout : console.log;
  writer(line);
}

async function runStatus(flags = {}, io = {}) {
  const project = await loadProject(process.cwd());
  const payload = await buildStatusPayload(project);

  if (flags.json) {
    writeLine(io, JSON.stringify({
      ok: true,
      ...payload,
    }, null, 2));
    return;
  }

  writeLine(io, "Summary");
  for (const status of ["todo", "claimed", "running", "review", "done", "failed", "blocked", "retry_wait", "cancelled"]) {
    if (payload.summary.counts[status]) {
      writeLine(io, `- ${status}: ${payload.summary.counts[status]}`);
    }
  }
  writeLine(io, `- waiting_human: ${payload.summary.waiting_human}`);
  writeLine(io, `- auto_reenqueued: ${payload.summary.auto_reenqueued}`);
  writeLine(io, `- manual_interventions: ${payload.summary.manual_interventions}`);

  writeLine(io, "");
  writeLine(io, "Tasks");
  if (payload.tasks.length === 0) {
    writeLine(io, "No tasks.");
    return;
  }

  for (const task of payload.tasks) {
    writeLine(io, [
      task.id.padEnd(20, " "),
      task.scheduler_status.padEnd(12, " "),
      task.workflow_status.padEnd(14, " "),
      task.active_profile.padEnd(12, " "),
      String(task.agent || "-").padEnd(18, " "),
      String(task.workspace || "-"),
    ].join(" "));
    if (task.summary) {
      writeLine(io, `  summary: ${task.summary}`);
    }
    if (task.workflow_action) {
      writeLine(io, `  workflow: ${task.workflow_action} -> ${task.workflow_status}`);
    }
    if (task.blockers.length > 0) {
      writeLine(io, `  blockers: ${task.blockers.join(" | ")}`);
    }
    if (task.next_actions.length > 0) {
      writeLine(io, `  next_actions: ${task.next_actions.join(" | ")}`);
    }
    if (task.workflow_reason) {
      writeLine(io, `  reason: ${task.workflow_reason}`);
    }
    if (task.recommended_action) {
      writeLine(io, `  next: ${task.recommended_action}`);
    }
    if (task.enqueue_source || task.enqueue_reason) {
      writeLine(io, `  queue: ${(task.enqueue_source || "-")} | ${task.enqueue_reason || "-"}`);
    }
    if (task.recent_activity) {
      writeLine(io, `  activity: ${task.recent_activity.summary} @ ${task.recent_activity.timestamp}`);
    }
  }

  writeLine(io, "");
  writeLine(io, `Active agents: ${payload.summary.active_agents}`);
}

module.exports = {
  runStatus,
  buildStatusPayload,
  summarizeRecentEvent,
};
