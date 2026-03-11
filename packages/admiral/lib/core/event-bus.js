"use strict";

const { appendFile } = require("node:fs/promises");

async function appendEvent(project, event, taskId, agentId, extra = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    task_id: taskId,
    agent_id: agentId,
    ...extra,
  });
  await appendFile(project.paths.eventsLog, `${line}\n`, "utf8");
}

module.exports = {
  appendEvent,
};
