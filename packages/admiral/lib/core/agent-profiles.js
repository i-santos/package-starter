"use strict";

function getTaskProfileName(project, task) {
  return task.profile || project.config.default_agent_profile || "default";
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

module.exports = {
  getTaskProfileName,
  getAgentProfile,
  assertKnownAgentProfile,
};
