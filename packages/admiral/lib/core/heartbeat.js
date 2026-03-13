"use strict";

const path = require("node:path");
const { writeJson, removeFileIfExists } = require("../utils/fs");

async function writeHeartbeat(project, payload) {
  const heartbeatPath = path.join(project.paths.runtimeHeartbeatsDir, `${payload.agent}.json`);
  await writeJson(heartbeatPath, {
    ...payload,
    updated_at: new Date().toISOString(),
  });
}

async function clearHeartbeat(project, agentId) {
  await removeFileIfExists(path.join(project.paths.runtimeHeartbeatsDir, `${agentId}.json`));
}

module.exports = {
  writeHeartbeat,
  clearHeartbeat,
};
