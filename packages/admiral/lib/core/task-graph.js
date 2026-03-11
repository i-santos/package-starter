"use strict";

const { attachTaskRecord, createTaskRecord } = require("@i-santos/workflow");

const VALID_STATUSES = new Set([
  "todo",
  "claimed",
  "running",
  "review",
  "done",
  "failed",
  "blocked",
  "retry_wait",
  "cancelled",
]);

function createTask(graph, input) {
  if (graph.tasks.some((task) => task.id === input.id)) {
    throw new Error(`task already exists: ${input.id}`);
  }

  const task = {
    id: input.id,
    title: input.title || input.id,
    scope: input.scope || "general",
    status: "todo",
    priority: input.priority || 1,
    depends_on: Array.isArray(input.depends_on) ? input.depends_on : [],
    agent: null,
    branch: null,
    workspace: null,
    retries: 0,
    hooks: input.hooks || {},
    metadata: attachTaskRecord(
      { metadata: input.metadata || {} },
      createTaskRecord({
        taskId: input.id,
        title: input.title || input.id,
        branch: input.branch || "",
        workspace: input.workspace || "",
        type: input.type || "task",
        ...(input.metadata && input.metadata.workflow ? input.metadata.workflow : {}),
      })
    ).metadata,
  };

  graph.tasks.push(task);
  return task;
}

function validateGraphIntegrity(graph) {
  const ids = new Set();
  for (const task of graph.tasks) {
    if (ids.has(task.id)) {
      throw new Error(`duplicate task id: ${task.id}`);
    }
    ids.add(task.id);
    if (!VALID_STATUSES.has(task.status)) {
      throw new Error(`invalid task status: ${task.status}`);
    }
  }
  for (const task of graph.tasks) {
    for (const dependency of task.depends_on) {
      if (!ids.has(dependency)) {
        throw new Error(`task ${task.id} depends on missing task ${dependency}`);
      }
    }
  }
}

function getTaskById(graph, id) {
  const task = graph.tasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`task not found: ${id}`);
  }
  return task;
}

function listTasks(graph) {
  return [...graph.tasks].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

function getTaskStateMap(graph) {
  return new Map(graph.tasks.map((task) => [task.id, task.status]));
}

function getReadyTasks(graph) {
  const stateMap = getTaskStateMap(graph);
  return listTasks(graph).filter((task) => {
    if (task.status !== "todo") {
      return false;
    }
    return task.depends_on.every((dependency) => stateMap.get(dependency) === "done");
  });
}

module.exports = {
  VALID_STATUSES,
  createTask,
  validateGraphIntegrity,
  getTaskById,
  listTasks,
  getReadyTasks,
};
