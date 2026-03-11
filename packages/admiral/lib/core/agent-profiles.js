"use strict";

const { readTaskRecord } = require("@i-santos/workflow");

function getTaskProfileName(project, task) {
  return task.profile || project.config.default_agent_profile || "default";
}

function getWorkflowStageProfileName(project, task) {
  const workflow = readTaskRecord(task);
  const workflowStatus = workflow.status;
  const stageProfile = project.config.workflow_stage_profiles
    ? project.config.workflow_stage_profiles[workflowStatus]
    : "";

  return {
    workflowStatus,
    stageProfile: typeof stageProfile === "string" && stageProfile ? stageProfile : "",
  };
}

function getAgentProfile(project, profileName) {
  const resolvedName = profileName || project.config.default_agent_profile || "default";
  const profile = project.config.agent_profiles && project.config.agent_profiles[resolvedName]
    ? project.config.agent_profiles[resolvedName]
    : null;

  if (profile) {
    return {
      name: resolvedName,
      command: profile.command,
      capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : [],
    };
  }

  return {
    name: resolvedName,
    command: project.config.agent_command,
    capabilities: [],
  };
}

function assertKnownAgentProfile(project, profileName) {
  if (!project.config.agent_profiles || !project.config.agent_profiles[profileName]) {
    throw new Error(`unknown agent profile: ${profileName}`);
  }
}

function resolveTaskAssignment(project, task) {
  const taskProfile = getTaskProfileName(project, task);
  const { workflowStatus, stageProfile } = getWorkflowStageProfileName(project, task);
  const resolvedProfileName = stageProfile || taskProfile;

  return {
    workflowStatus,
    taskProfile,
    stageProfile,
    resolvedProfile: getAgentProfile(project, resolvedProfileName),
  };
}

module.exports = {
  getTaskProfileName,
  getWorkflowStageProfileName,
  getAgentProfile,
  assertKnownAgentProfile,
  resolveTaskAssignment,
};
