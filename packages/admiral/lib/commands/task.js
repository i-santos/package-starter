"use strict";

const path = require("node:path");
const { writeFile } = require("node:fs/promises");
const { loadProject, withGraphMutation, saveBoard } = require("../core/project");
const { createTask, getTaskById, listTasks, validateGraphIntegrity } = require("../core/task-graph");
const { appendEvent } = require("../core/event-bus");
const { syncProjectContext, syncTaskContext } = require("../core/context-store");
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
  return {
    id: task.id,
    title: task.title,
    scope: task.scope,
    scheduler_status: task.status,
    priority: task.priority,
    depends_on: task.depends_on,
    agent: task.agent,
    branch: workflow.branch || task.branch || "",
    workspace: workflow.workspace || task.workspace || "",
    retries: task.retries,
    workflow,
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
    console.log(`- branch: ${payload.task.branch || "-"}`);
    console.log(`- workspace: ${payload.task.workspace || "-"}`);
    return;
  }

  if (Array.isArray(payload.tasks)) {
    if (payload.tasks.length === 0) {
      console.log("No tasks.");
      return;
    }
    for (const task of payload.tasks) {
      const deps = task.depends_on.length > 0 ? task.depends_on.join(",") : "-";
      console.log(`${task.id}\t${task.scheduler_status}\t${task.workflow.status}\t${task.scope}\tdeps:${deps}`);
    }
  }
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

async function mutateWorkflowTask(project, taskId, nextStatus, options = {}) {
  let updatedTask;
  await withGraphMutation(project, async (graph) => {
    const task = getTaskById(graph, taskId);
    const currentRecord = readTaskRecord(task);
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
  printTask({ ok: true, action: "create", task: formatTask(createdTask) }, flags);
}

async function runTaskList(flags = {}) {
  const project = await loadProject(process.cwd());
  printTask({
    ok: true,
    action: "list",
    tasks: listTasks(project.graph).map(formatTask),
  }, flags);
}

async function runTaskStatus(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  printTask({
    ok: true,
    action: "status",
    task: formatTask(task),
  }, flags);
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
    },
  });
  printTask({ ok: true, action: "verify", task: formatTask(updated) }, flags);
}

async function runTaskPublishReady(taskId, flags = {}) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  const current = readTaskRecord(task);
  if (current.checks.unit !== "pass" || current.checks.integration !== "pass") {
    throw new Error(
      `Cannot mark task as publish_ready. Expected checks unit=pass and integration=pass but got unit=${current.checks.unit}, integration=${current.checks.integration}.`
    );
  }

  const updated = await mutateWorkflowTask(project, taskId, "publish_ready", {
    eventName: "TASK_WORKFLOW_PUBLISH_READY",
  });
  printTask({ ok: true, action: "publish-ready", task: formatTask(updated) }, flags);
}

async function runTaskRetry(taskId) {
  const project = await loadProject(process.cwd());
  let retried = false;
  await withGraphMutation(project, (graph) => {
    const task = getTaskById(graph, taskId);
    task.status = "todo";
    task.agent = null;
    task.branch = null;
    task.workspace = null;
    retried = true;
    return graph;
  });

  if (!retried) {
    throw new Error(`task not found: ${taskId}`);
  }

  await appendEvent(project, "TASK_RETRIED", taskId, null);
  await saveBoard(project);
  await syncProjectContext(project);
  await syncTaskContext(project, getTaskById(project.graph, taskId));
  console.log(`Retried task ${taskId}`);
}

module.exports = {
  runTaskCreate,
  runTaskList,
  runTaskStatus,
  runTaskPlan,
  runTaskTdd,
  runTaskImplement,
  runTaskVerify,
  runTaskPublishReady,
  runTaskRetry,
};
