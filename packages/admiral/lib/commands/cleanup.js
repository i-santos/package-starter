"use strict";

const { loadProject, withGraphMutation, saveBoard } = require("../core/project");
const { removeWorkspaceForTask } = require("../core/workspace-manager");

async function runCleanup(taskId) {
  const project = await loadProject(process.cwd());
  const tasks = taskId
    ? project.graph.tasks.filter((task) => task.id === taskId)
    : project.graph.tasks.filter((task) => ["done", "failed", "cancelled"].includes(task.status));

  for (const task of tasks) {
    await removeWorkspaceForTask(project, task);
  }

  await withGraphMutation(project, (graph) => {
    for (const task of graph.tasks) {
      if (!taskId && !["done", "failed", "cancelled"].includes(task.status)) {
        continue;
      }
      if (taskId && task.id !== taskId) {
        continue;
      }
      task.workspace = null;
    }
    return graph;
  });

  await saveBoard(project);
  console.log(`Cleaned ${tasks.length} workspace(s)`);
}

module.exports = {
  runCleanup,
};
