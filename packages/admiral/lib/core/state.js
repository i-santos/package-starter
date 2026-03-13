"use strict";

function defaultConfig() {
  const defaultAgentCommand = "node -e \"setTimeout(()=>process.exit(0), 250)\"";
  return {
    max_agents: 2,
    scheduler_interval_ms: 2000,
    heartbeat_timeout_ms: 15000,
    max_retries_per_task: 2,
    auto_merge: false,
    default_branch: "main",
    agent_command: defaultAgentCommand,
    default_agent_profile: "default",
    workflow_stage_profiles: {
      new: "planner",
      planned: "planner",
      tdd_ready: "implementer",
      implemented: "reviewer",
      verified: "reviewer",
      publish_ready: "reviewer",
      released: "reviewer",
    },
    agent_profiles: {
      default: {
        command: defaultAgentCommand,
        capabilities: ["general_execution"],
      },
      planner: {
        command: defaultAgentCommand,
        capabilities: ["planning", "analysis"],
      },
      implementer: {
        command: defaultAgentCommand,
        capabilities: ["implementation", "refactoring"],
      },
      reviewer: {
        command: defaultAgentCommand,
        capabilities: ["verification", "review"],
      },
    },
    scopes: {
      backend: ["src/backend", "tests"],
      frontend: ["src/frontend", "tests"],
      tests: ["tests"],
      general: ["/*"]
    }
  };
}

function normalizeConfig(config = {}) {
  const defaults = defaultConfig();
  const defaultAgentProfile = typeof config.default_agent_profile === "string" && config.default_agent_profile
    ? config.default_agent_profile
    : defaults.default_agent_profile;
  const rawProfiles = config.agent_profiles && typeof config.agent_profiles === "object" && !Array.isArray(config.agent_profiles)
    ? config.agent_profiles
    : {};
  const normalizedProfiles = {};

  for (const [profileName, profileDefaults] of Object.entries(defaults.agent_profiles)) {
    const candidate = rawProfiles[profileName] && typeof rawProfiles[profileName] === "object" && !Array.isArray(rawProfiles[profileName])
      ? rawProfiles[profileName]
      : {};
    const inheritedAgentCommand = typeof config.agent_command === "string" && config.agent_command
      ? config.agent_command
      : profileDefaults.command;
    const fallbackCommand = inheritedAgentCommand;
    const command = typeof candidate.command === "string" && candidate.command
      ? (
        candidate.command === profileDefaults.command
        && typeof config.agent_command === "string"
        && config.agent_command
          ? config.agent_command
          : candidate.command
      )
      : fallbackCommand;
    normalizedProfiles[profileName] = {
      command,
      capabilities: Array.isArray(candidate.capabilities) ? candidate.capabilities : profileDefaults.capabilities,
    };
  }

  for (const [profileName, profile] of Object.entries(rawProfiles)) {
    if (normalizedProfiles[profileName]) {
      continue;
    }
    const candidate = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
    normalizedProfiles[profileName] = {
      command: typeof candidate.command === "string" && candidate.command ? candidate.command : defaults.agent_command,
      capabilities: Array.isArray(candidate.capabilities) ? candidate.capabilities : [],
    };
  }

  return {
    ...defaults,
    ...config,
    agent_command: typeof config.agent_command === "string" && config.agent_command ? config.agent_command : defaults.agent_command,
    default_agent_profile: normalizedProfiles[defaultAgentProfile] ? defaultAgentProfile : defaults.default_agent_profile,
    workflow_stage_profiles: {
      ...defaults.workflow_stage_profiles,
      ...((config.workflow_stage_profiles && typeof config.workflow_stage_profiles === "object" && !Array.isArray(config.workflow_stage_profiles))
        ? config.workflow_stage_profiles
        : {}),
    },
    agent_profiles: normalizedProfiles,
    scopes: {
      ...defaults.scopes,
      ...((config.scopes && typeof config.scopes === "object" && !Array.isArray(config.scopes)) ? config.scopes : {}),
    },
  };
}

function emptyGraph() {
  return {
    version: 1,
    tasks: [],
  };
}

function emptyBoard() {
  return {
    updated_at: new Date(0).toISOString(),
    columns: {
      todo: [],
      claimed: [],
      running: [],
      review: [],
      done: [],
      failed: [],
      blocked: [],
      retry_wait: [],
      cancelled: [],
    },
    active_agents: [],
  };
}

module.exports = {
  normalizeConfig,
  defaultConfig,
  emptyBoard,
  emptyGraph,
};
