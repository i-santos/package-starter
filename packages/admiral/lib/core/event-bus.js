"use strict";

const { appendFile, readFile } = require("node:fs/promises");

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

async function readEvents(project, options = {}) {
  let contents = "";
  try {
    contents = await readFile(project.paths.eventsLog, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  let items = contents
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (options.taskId) {
    items = items.filter((item) => item.task_id === options.taskId);
  }

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    items = items.slice(-options.limit);
  }

  return items;
}

module.exports = {
  appendEvent,
  readEvents,
};
