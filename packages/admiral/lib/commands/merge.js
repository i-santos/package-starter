"use strict";

const path = require("node:path");
const { loadProject, withGraphMutation, saveBoard } = require("../core/project");
const { getTaskById } = require("../core/task-graph");
const { execFile } = require("../utils/process");
const { appendEvent } = require("../core/event-bus");
const { removeWorkspaceForTask } = require("../core/workspace-manager");
const { removeFileIfExists } = require("../utils/fs");

async function runMerge(taskId) {
  const project = await loadProject(process.cwd());
  const task = getTaskById(project.graph, taskId);
  if (task.status !== "review") {
    throw new Error(`task ${taskId} is not in review`);
  }
  if (!task.branch) {
    throw new Error(`task ${taskId} has no branch to merge`);
  }

  await execFile("git", ["checkout", project.config.default_branch], {
    cwd: project.root,
  });
  await execFile("git", ["merge", "--no-ff", "--no-edit", task.branch], {
    cwd: project.root,
  });

  await withGraphMutation(project, (graph) => {
    const freshTask = getTaskById(graph, taskId);
    freshTask.status = "done";
    return graph;
  });

  await appendEvent(project, "MERGE_COMPLETED", taskId, null);
  await removeWorkspaceForTask(project, task);
  await removeFileIfExists(path.join(project.paths.runtimePidsDir, `${task.id}.json`));
  await saveBoard(project);
  console.log(`Merged ${taskId} into ${project.config.default_branch}`);
}

module.exports = {
  runMerge,
};
