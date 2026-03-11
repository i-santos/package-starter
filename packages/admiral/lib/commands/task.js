"use strict";

const { loadProject, withGraphMutation, saveBoard } = require("../core/project");
const { createTask, getTaskById, listTasks, validateGraphIntegrity } = require("../core/task-graph");
const { appendEvent } = require("../core/event-bus");

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
    validateGraphIntegrity(graph);
    return graph;
  });

  await appendEvent(project, "TASK_CREATED", createdTask.id, null);
  await saveBoard(project);
  console.log(`Created task ${createdTask.id}`);
}

async function runTaskList() {
  const project = await loadProject(process.cwd());
  const tasks = listTasks(project.graph);
  if (tasks.length === 0) {
    console.log("No tasks.");
    return;
  }

  for (const task of tasks) {
    const deps = task.depends_on.length > 0 ? task.depends_on.join(",") : "-";
    console.log(`${task.id}\t${task.status}\t${task.scope}\tdeps:${deps}`);
  }
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
  console.log(`Retried task ${taskId}`);
}

module.exports = {
  runTaskCreate,
  runTaskList,
  runTaskRetry,
};
