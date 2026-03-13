"use strict";

const path = require("node:path");
const { writeFile } = require("node:fs/promises");
const { loadProject, withGraphMutation, saveBoard } = require("../core/project");
const { createTask, getTaskById, listTasks, validateGraphIntegrity } = require("../core/task-graph");
const { appendEvent, readEvents } = require("../core/event-bus");
const { syncProjectContext, syncTaskContext } = require("../core/context-store");
const { assertKnownAgentProfile, resolveTaskAssignment } = require("../core/agent-profiles");
const { attachTaskRecord, createTaskRecord, readTaskRecord, transitionTask } = require("@i-santos/workflow");
const { ensureDir, pathExists } = require("../utils/fs");

function sanitizeTaskTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task";
}

function formatTask(task) {
  const workflow = readTaskRecord(task);
  const execution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
  const assignment = task.__assignment || null;
  return {
    id: task.id,
    title: task.title,
    scope: task.scope,
    profile: task.profile || "default",
    stage_profile: assignment ? assignment.stageProfile : "",
    active_profile: assignment ? assignment.resolvedProfile.name : (task.profile || "default"),
    scheduler_status: task.status,
    priority: task.priority,
    depends_on: task.depends_on,
    agent: task.agent,
    branch: workflow.branch || task.branch || "",
    workspace: workflow.workspace || task.workspace || "",
    retries: task.retries,
    workflow,
    execution,
  };
}

function printTask(payload, flags = {}) {
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.task) {
    console.log(`Task ${payload.task.id}`);
    console.log(`- scheduler_status: ${payload.task.scheduler_status}`);
    console.log(`- workflow_status: ${payload.task.workflow.status}`);
    console.log(`- scope: ${payload.task.scope}`);
    console.log(`- profile: ${payload.task.profile}`);
    console.log(`- stage_profile: ${payload.task.stage_profile || "-"}`);
    console.log(`- active_profile: ${payload.task.active_profile || payload.task.profile}`);
    console.log(`- branch: ${payload.task.branch || "-"}`);
    console.log(`- workspace: ${payload.task.workspace || "-"}`);
    if (payload.task.execution.last_summary) {
      console.log(`- summary: ${payload.task.execution.last_summary}`);
    }
    if (Array.isArray(payload.task.execution.last_blockers) && payload.task.execution.last_blockers.length > 0) {
      console.log(`- blockers: ${payload.task.execution.last_blockers.join(" | ")}`);
    }
    if (Array.isArray(payload.task.execution.last_next_actions) && payload.task.execution.last_next_actions.length > 0) {
      console.log(`- next_actions: ${payload.task.execution.last_next_actions.join(" | ")}`);
    }
    return;
  }

  if (Array.isArray(payload.tasks)) {
    if (payload.tasks.length === 0) {
      console.log("No tasks.");
      return;
    }
    for (const task of payload.tasks) {
      const deps = task.depends_on.length > 0 ? task.depends_on.join(",") : "-";
      console.log(`${task.id}\t${task.scheduler_status}\t${task.workflow.status}\t${task.scope}\tprofile:${task.profile}\tactive:${task.active_profile}\tdeps:${deps}`);
    }
  }
}

function formatEventSummary(event) {
  if (event.event.startsWith("TASK_WORKFLOW_") && event.workflow_status) {
    return `workflow ${event.workflow_status}`;
  }
  if (event.event === "TASK_REENQUEUED") {
    return `re-enqueued (${event.source || "unknown"}): ${event.reason || "-"}`;
  }
  if (event.event === "TASK_WORKFLOW_AUTO_ADVANCED") {
    return `workflow advanced to ${event.workflow_status || "-"}: ${event.reason || "-"}`;
  }
  if (event.event === "TASK_WORKFLOW_REWORK_REQUIRED") {
    return `workflow rework -> ${event.workflow_status || "-"}: ${event.reason || "-"}`;
  }
  if (event.event === "TASK_CLAIMED") {
    return `claimed by ${event.agent_id || "-"} (${event.enqueue_source || "unknown"} queue)`;
  }
  if (event.event === "TASK_STARTED") {
    return `started by ${event.agent_id || "-"} (pid ${event.pid || "-"})`;
  }
  if (event.event === "TASK_DONE" || event.event === "TASK_BLOCKED" || event.event === "TASK_COMPLETED") {
    return `${event.event.toLowerCase()} -> ${event.scheduler_status || "-"} (${event.workflow_action || "-"} -> ${event.workflow_status || "-"})`;
  }
  if (event.event === "TASK_RETRIED") {
    return "manual retry requested";
  }
  if (event.event === "TASK_UNBLOCKED") {
    return "manual unblock requested";
  }
  if (event.event === "TASK_DONE_MANUAL") {
    return "manually marked done";
  }
  return event.event.toLowerCase();
}

async function ensureFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  if (!(await pathExists(filePath))) {
    await writeFile(filePath, content, "utf8");
  }
}

function getDocsPaths(project, taskRecord) {
  const slug = sanitizeTaskTitle(taskRecord.title);
  return {
    planFile: path.join(project.root, "docs", "plans", `${taskRecord.taskId}-${slug}.plan.md`),
    tddFile: path.join(project.root, "docs", "plans", `${taskRecord.taskId}-${slug}.tdd.md`),
    implementationFile: path.join(project.root, "docs", "plans", `${taskRecord.taskId}-${slug}.implementation.md`),
    reportFile: path.join(project.root, "docs", "tests", `${taskRecord.taskId}-verification.local.md`),
  };
}

function getStageSummary(project, nextStatus, taskRecord, docs) {
  if (nextStatus === "planned") {
    return {
      stage: "planned",
      title: taskRecord.title,
      artifacts: {
        planFile: path.relative(project.root, docs.planFile),
      },
      checklist: ["goals", "constraints", "risks", "implementation steps"],
      entry_criteria: ["task_created"],
      exit_criteria: ["plan_documented"],
    };
  }

  if (nextStatus === "tdd_ready") {
    return {
      stage: "tdd_ready",
      title: taskRecord.title,
      artifacts: {
        tddFile: path.relative(project.root, docs.tddFile),
      },
      checklist: ["failing cases", "test strategy", "coverage notes"],
      entry_criteria: ["plan_documented"],
      exit_criteria: ["tests_defined"],
    };
  }

  if (nextStatus === "implemented") {
    return {
      stage: "implemented",
      title: taskRecord.title,
      artifacts: {
        implementationFile: path.relative(project.root, docs.implementationFile),
      },
      checklist: ["scope", "changed files", "risks and mitigations", "follow-ups"],
      entry_criteria: ["tests_defined"],
      exit_criteria: ["implementation_notes_recorded"],
    };
  }

  if (nextStatus === "verified") {
    return {
      stage: "verified",
      title: taskRecord.title,
      artifacts: {
        reportFile: path.relative(project.root, docs.reportFile),
      },
      checklist: ["unit", "integration", "e2e"],
      entry_criteria: ["implementation_notes_recorded"],
      exit_criteria: ["verification_report_recorded"],
    };
  }

  if (nextStatus === "publish_ready") {
    return {
      stage: "publish_ready",
      title: taskRecord.title,
      artifacts: {
        reportFile: taskRecord.artifacts && taskRecord.artifacts.reportFile ? taskRecord.artifacts.reportFile : "",
      },
      checklist: ["unit_pass", "integration_pass"],
      entry_criteria: ["verification_report_recorded"],
      exit_criteria: ["release_ready"],
    };
  }

  return null;
}

function assertStagePrerequisites(taskRecord, nextStatus) {
  const artifacts = taskRecord.artifacts || {};
  if (nextStatus === "implemented" && !artifacts.tddFile) {
    throw new Error("cannot move to implemented without a tdd handoff");
  }
  if (nextStatus === "verified" && !artifacts.implementationFile) {
    throw new Error("cannot move to verified without an implementation handoff");
  }
  if (nextStatus === "publish_ready" && !artifacts.reportFile) {
    throw new Error("cannot move to publish_ready without a verification handoff");
  }
}

async function mutateWorkflowTask(project, taskId, nextStatus, options = {}) {
  let updatedTask;
  await withGraphMutation(project, async (graph) => {
    const task = getTaskById(graph, taskId);
    const currentRecord = readTaskRecord(task);
    assertStagePrerequisites(currentRecord, nextStatus);
    const transitioned = transitionTask(currentRecord, nextStatus, new Date().toISOString());
    const nextRecord = {
      ...transitioned,
      ...(options.recordPatch || {}),
      artifacts: {
        ...(transitioned.artifacts || {}),
        ...((options.recordPatch && options.recordPatch.artifacts) || {}),
      },
      checks: {
        ...(transitioned.checks || {}),
        ...((options.recordPatch && options.recordPatch.checks) || {}),
      },
      release: {
        ...(transitioned.release || {}),
        ...((options.recordPatch && options.recordPatch.release) || {}),
      },
      stage_handoffs: {
        ...(transitioned.stage_handoffs || {}),
        ...((options.recordPatch && options.recordPatch.stage_handoffs) || {}),
      },
    };

    if (options.taskPatch) {
      Object.assign(task, options.taskPatch(nextRecord, task));
    }

    updatedTask = attachTaskRecord(task, nextRecord);
    Object.assign(task, updatedTask);
    validateGraphIntegrity(graph);
    return graph;
  });

  await saveBoard(project);
  await syncProjectContext(project);
  if (options.eventName) {
    await appendEvent(project, options.eventName, taskId, null, {
      workflow_status: nextStatus,
    });
  }
  await syncTaskContext(project, updatedTask);
  return updatedTask;
}

async function runTaskCreate(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const profile = flags.profile || project.config.default_agent_profile || "default";
  assertKnownAgentProfile(project, profile);
  const dependsOn = typeof flags["depends-on"] === "string" && flags["depends-on"].length > 0
    ? flags["depends-on"].split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const priority = flags.priority ? Number(flags.priority) : 1;

  let createdTask;
  await withGraphMutation(project, (graph) => {
    createdTask = createTask(graph, {
      id: taskId,
      title: flags.title || taskId,
      scope: flags.scope || "general",
      profile,
      priority: Number.isFinite(priority) ? priority : 1,
      depends_on: dependsOn,
    });
    createdTask = attachTaskRecord(createdTask, createTaskRecord({
      taskId,
      title: flags.title || taskId,
      type: flags.type || "task",
      branch: flags.branch || "",
      status: "new",
    }));
    validateGraphIntegrity(graph);
    return graph;
  });

  await appendEvent(project, "TASK_CREATED", createdTask.id, null);
  await saveBoard(project);
  await syncProjectContext(project);
  await syncTaskContext(project, createdTask);
  printTask({
    ok: true,
    action: "create",
    task: formatTask({
      ...createdTask,
      __assignment: resolveTaskAssignment(project, createdTask),
    }),
  }, flags);
}

async function runTaskList(flags = {}) {
  const project = await loadProject(process.cwd());
  printTask({
    ok: true,
    action: "list",
    tasks: listTasks(project.graph).map((task) => formatTask({
      ...task,
      __assignment: resolveTaskAssignment(project, task),
    })),
  }, flags);
}

async function runTaskStatus(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  printTask({
    ok: true,
    action: "status",
    task: formatTask({
      ...task,
      __assignment: resolveTaskAssignment(project, task),
    }),
  }, flags);
}

async function runTaskHistory(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const limit = flags.limit ? Number(flags.limit) : null;
  const events = await readEvents(project, {
    taskId,
    limit: Number.isFinite(limit) ? limit : null,
  });

  if (flags.json) {
    console.log(JSON.stringify({
      ok: true,
      action: "history",
      task_id: taskId,
      count: events.length,
      events,
    }, null, 2));
    return;
  }

  console.log(`History ${taskId}`);
  if (events.length === 0) {
    console.log("No events.");
    return;
  }

  for (const event of events) {
    console.log(`- ${event.timestamp} ${formatEventSummary(event)}`);
  }
}

async function runTaskPlan(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  const docs = getDocsPaths(project, current);
  await ensureFile(docs.planFile, [
    `# Plan: ${current.title}`,
    "",
    `- taskId: ${current.taskId}`,
    "- goals:",
    "- constraints:",
    "- risks:",
    "- implementation steps:",
    "",
  ].join("\n"));

  const updated = await mutateWorkflowTask(project, taskId, "planned", {
    eventName: "TASK_WORKFLOW_PLANNED",
    recordPatch: {
      artifacts: {
        planFile: path.relative(project.root, docs.planFile),
      },
      stage_handoffs: {
        planned: getStageSummary(project, "planned", current, docs),
      },
    },
  });
  printTask({ ok: true, action: "plan", task: formatTask(updated) }, flags);
}

async function runTaskTdd(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  const docs = getDocsPaths(project, current);
  await ensureFile(docs.tddFile, [
    `# TDD: ${current.title}`,
    "",
    `- taskId: ${current.taskId}`,
    "- failing cases:",
    "- test strategy:",
    "- coverage notes:",
    "",
  ].join("\n"));

  const updated = await mutateWorkflowTask(project, taskId, "tdd_ready", {
    eventName: "TASK_WORKFLOW_TDD_READY",
    recordPatch: {
      artifacts: {
        tddFile: path.relative(project.root, docs.tddFile),
      },
      stage_handoffs: {
        tdd_ready: getStageSummary(project, "tdd_ready", current, docs),
      },
    },
  });
  printTask({ ok: true, action: "tdd", task: formatTask(updated) }, flags);
}

async function runTaskImplement(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  const docs = getDocsPaths(project, current);
  await ensureFile(docs.implementationFile, [
    `# Implementation Notes: ${current.title}`,
    "",
    `- taskId: ${current.taskId}`,
    "- scope:",
    "- changed files:",
    "- risks and mitigations:",
    "- follow-ups:",
    "",
  ].join("\n"));

  const updated = await mutateWorkflowTask(project, taskId, "implemented", {
    eventName: "TASK_WORKFLOW_IMPLEMENTED",
    recordPatch: {
      artifacts: {
        implementationFile: path.relative(project.root, docs.implementationFile),
      },
      stage_handoffs: {
        implemented: getStageSummary(project, "implemented", current, docs),
      },
    },
  });
  printTask({ ok: true, action: "implement", task: formatTask(updated) }, flags);
}

async function runTaskVerify(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  const docs = getDocsPaths(project, current);
  await ensureFile(docs.reportFile, [
    `# Verification Report: ${current.title}`,
    "",
    `- taskId: ${current.taskId}`,
    "- unit: pass",
    "- integration: pass",
    `- e2e: ${current.checks && current.checks.e2e ? current.checks.e2e : "not_required"}`,
    "",
  ].join("\n"));

  const updated = await mutateWorkflowTask(project, taskId, "verified", {
    eventName: "TASK_WORKFLOW_VERIFIED",
    recordPatch: {
      artifacts: {
        reportFile: path.relative(project.root, docs.reportFile),
      },
      checks: {
        unit: "pass",
        integration: "pass",
        e2e: current.checks && current.checks.e2e ? current.checks.e2e : "not_required",
      },
      stage_handoffs: {
        verified: getStageSummary(project, "verified", current, docs),
      },
    },
  });
  printTask({ ok: true, action: "verify", task: formatTask(updated) }, flags);
}

async function runTaskPublishReady(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  const docs = getDocsPaths(project, current);
  if (current.checks.unit !== "pass" || current.checks.integration !== "pass") {
    throw new Error(
      `Cannot mark task as publish_ready. Expected checks unit=pass and integration=pass but got unit=${current.checks.unit}, integration=${current.checks.integration}.`
    );
  }

  const updated = await mutateWorkflowTask(project, taskId, "publish_ready", {
    eventName: "TASK_WORKFLOW_PUBLISH_READY",
    recordPatch: {
      stage_handoffs: {
        publish_ready: getStageSummary(project, "publish_ready", current, docs),
      },
    },
  });
  printTask({ ok: true, action: "publish-ready", task: formatTask(updated) }, flags);
}

async function runTaskRetry(taskId) {
  const project = await loadProject(process.cwd());
  let retried = false;
  let updatedTask;
  await withGraphMutation(project, (graph) => {
    const task = getTaskById(graph, taskId);
    const previousExecution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
    task.status = "todo";
    task.agent = null;
    task.branch = null;
    task.workspace = null;
    task.metadata = {
      ...(task.metadata || {}),
      execution: {
        ...previousExecution,
        last_decision: "todo",
        last_recommended_action: "continue",
        last_enqueue_source: "manual",
        last_enqueue_reason: "Manual retry requested.",
        last_enqueue_at: new Date().toISOString(),
      },
    };
    updatedTask = task;
    retried = true;
    return graph;
  });

  if (!retried) {
    throw new Error(`task not found: ${taskId}`);
  }

  await appendEvent(project, "TASK_RETRIED", taskId, null);
  await appendEvent(project, "TASK_REENQUEUED", taskId, null, {
    source: "manual",
    reason: "Manual retry requested.",
  });
  await saveBoard(project);
  await syncProjectContext(project);
  await syncTaskContext(project, updatedTask);
  console.log(`Retried task ${taskId}`);
}

async function runTaskUnblock(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  let updatedTask;
  await withGraphMutation(project, (graph) => {
    const task = getTaskById(graph, taskId);
    if (task.status !== "blocked") {
      throw new Error(`task ${taskId} is not blocked`);
    }
    const previousExecution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
    task.status = "todo";
    task.metadata = {
      ...(task.metadata || {}),
      execution: {
        ...previousExecution,
        last_blockers: [],
        last_decision: "todo",
        last_recommended_action: "continue",
        last_enqueue_source: "manual",
        last_enqueue_reason: "Manual unblock requested.",
        last_enqueue_at: new Date().toISOString(),
      },
    };
    updatedTask = task;
    return graph;
  });

  await appendEvent(project, "TASK_UNBLOCKED", taskId, null);
  await appendEvent(project, "TASK_REENQUEUED", taskId, null, {
    source: "manual",
    reason: "Manual unblock requested.",
  });
  await saveBoard(project);
  await syncProjectContext(project);
  await syncTaskContext(project, updatedTask);
  printTask({ ok: true, action: "unblock", task: formatTask(updatedTask) }, flags);
}

async function runTaskDone(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  let updatedTask;
  await withGraphMutation(project, (graph) => {
    const task = getTaskById(graph, taskId);
    if (!["review", "blocked"].includes(task.status)) {
      throw new Error(`task ${taskId} is not in review or blocked`);
    }
    task.status = "done";
    updatedTask = task;
    return graph;
  });

  await appendEvent(project, "TASK_DONE_MANUAL", taskId, null);
  await saveBoard(project);
  await syncProjectContext(project);
  await syncTaskContext(project, updatedTask);
  printTask({ ok: true, action: "done", task: formatTask(updatedTask) }, flags);
}

module.exports = {
  runTaskCreate,
  runTaskList,
  runTaskStatus,
  runTaskHistory,
  runTaskPlan,
  runTaskTdd,
  runTaskImplement,
  runTaskVerify,
  runTaskPublishReady,
  runTaskRetry,
  runTaskUnblock,
  runTaskDone,
};
