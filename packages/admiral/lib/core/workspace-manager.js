"use strict";

const path = require("node:path");
const { writeFile, rm, mkdir } = require("node:fs/promises");
const { execFile } = require("../utils/process");

function sanitizeBranchTaskId(taskId) {
  return taskId.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

async function ensureWorkspace(project, task) {
  const branch = task.branch || `agent/${sanitizeBranchTaskId(task.id)}`;
  const workspace = task.workspace || path.join(project.paths.workspacesDir, task.id);
  const branchExists = await execFile("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: project.root,
    allowFailure: true,
  });

  if (branchExists.code === 0) {
    await execFile("git", ["worktree", "add", "-f", workspace, branch], {
      cwd: project.root,
    });
  } else {
    await execFile("git", ["worktree", "add", "-f", workspace, "-b", branch], {
      cwd: project.root,
    });
  }

  await applySparseCheckout(project, workspace, task.scope);

  return {
    branch,
    workspace,
  };
}

async function applySparseCheckout(project, workspace, scope) {
  const entries = project.config.scopes[scope] || project.config.scopes.general || ["."];
  await execFile("git", ["-C", workspace, "config", "core.sparseCheckout", "true"]);
  const { stdout } = await execFile("git", ["-C", workspace, "rev-parse", "--git-path", "info/sparse-checkout"]);
  const sparsePath = stdout.trim();
  await mkdir(path.dirname(sparsePath), { recursive: true });
  const content = `${entries.join("\n")}\n`;
  await writeFile(sparsePath, content, "utf8");
  await execFile("git", ["-C", workspace, "read-tree", "-mu", "HEAD"]);
}

async function removeWorkspaceForTask(project, task) {
  if (!task.workspace) {
    return;
  }
  await execFile("git", ["worktree", "remove", "--force", task.workspace], {
    cwd: project.root,
  }).catch(async () => {
    await rm(task.workspace, { recursive: true, force: true });
  });
}

module.exports = {
  ensureWorkspace,
  applySparseCheckout,
  removeWorkspaceForTask,
};
