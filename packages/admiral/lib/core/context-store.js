"use strict";

const path = require("node:path");
const { writeJson, readJsonIfExists } = require("../utils/fs");
const { readTaskRecord } = require("@i-santos/workflow");
const { resolveTaskAssignment } = require("./agent-profiles");

function getTaskContextPath(project, taskId) {
  return path.join(project.paths.contextTasksDir, `${taskId}.json`);
}

function getTaskHandoffPath(project, taskId) {
  return path.join(project.paths.contextHandoffsDir, `${taskId}.json`);
}

async function syncProjectContext(project) {
  const agentProfiles = Object.fromEntries(
    Object.entries(project.config.agent_profiles || {}).map(([name, profile]) => [
      name,
      {
        capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : [],
      },
    ])
  );

  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    project: {
      root: project.root,
      default_branch: project.config.default_branch,
      max_agents: project.config.max_agents,
      default_agent_profile: project.config.default_agent_profile,
      workflow_stage_profiles: project.config.workflow_stage_profiles || {},
      agent_profiles: agentProfiles,
      scopes: project.config.scopes,
    },
  };

  await writeJson(project.paths.contextProject, payload);
  return payload;
}

function buildTaskContext(project, task) {
  const workflow = readTaskRecord(task);
  const execution = task.metadata && task.metadata.execution ? task.metadata.execution : {};
  const assignment = resolveTaskAssignment(project, task);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    project_root: project.root,
    task: {
      id: task.id,
      title: task.title,
      scope: task.scope,
      profile: task.profile || project.config.default_agent_profile || "default",
      scheduler_status: task.status,
      priority: task.priority,
      depends_on: task.depends_on || [],
      agent: task.agent,
      branch: task.branch || "",
      workspace: task.workspace || "",
      retries: task.retries,
    },
    workflow,
    assignment: {
      workflow_status: assignment.workflowStatus,
      task_profile: assignment.taskProfile,
      stage_profile: assignment.stageProfile,
      active_profile: assignment.resolvedProfile.name,
      active_capabilities: assignment.resolvedProfile.capabilities,
    },
    execution,
    refs: {
      handoff: getTaskHandoffPath(project, task.id),
    },
  };
}

async function syncTaskContext(project, task) {
  const payload = buildTaskContext(project, task);
  await writeJson(getTaskContextPath(project, task.id), payload);
  return payload;
}

async function writeTaskHandoff(project, task, handoffUpdate = {}) {
  const handoffPath = getTaskHandoffPath(project, task.id);
  const existing = await readJsonIfExists(handoffPath, {
    version: 1,
    task_id: task.id,
    history: [],
  });

  const entry = {
    timestamp: new Date().toISOString(),
    scheduler_status: task.status,
    workflow_status: readTaskRecord(task).status,
    ...handoffUpdate,
  };

  const payload = {
    ...existing,
    latest: entry,
    history: [...(existing.history || []), entry].slice(-20),
  };

  await writeJson(handoffPath, payload);
  return payload;
}

module.exports = {
  getTaskContextPath,
  getTaskHandoffPath,
  syncProjectContext,
  syncTaskContext,
  writeTaskHandoff,
};
