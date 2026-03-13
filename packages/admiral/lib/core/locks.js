"use strict";

const { mkdir, rm } = require("node:fs/promises");
const path = require("node:path");
const { sleep } = require("../utils/time");

async function withLock(lockPath, fn, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const retryDelayMs = options.retryDelayMs || 50;
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`timed out waiting for lock ${path.basename(lockPath)}`);
      }
      await sleep(retryDelayMs);
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

module.exports = {
  withLock,
};
