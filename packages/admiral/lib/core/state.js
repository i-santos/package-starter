"use strict";

function defaultConfig() {
  return {
    max_agents: 2,
    scheduler_interval_ms: 2000,
    heartbeat_timeout_ms: 15000,
    max_retries_per_task: 2,
    auto_merge: false,
    default_branch: "main",
    agent_command: "node -e \"setTimeout(()=>process.exit(0), 250)\"",
    scopes: {
      backend: ["src/backend", "tests"],
      frontend: ["src/frontend", "tests"],
      tests: ["tests"],
      general: ["/*"]
    }
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
  defaultConfig,
  emptyBoard,
  emptyGraph,
};
