"use strict";

function shouldRetry(task, config) {
  return task.retries < config.max_retries_per_task;
}

function applyRetry(task, config) {
  task.retries += 1;
  task.agent = null;
  task.branch = null;
  task.workspace = null;
  task.status = shouldRetry(task, config) ? "retry_wait" : "failed";
  return task;
}

module.exports = {
  shouldRetry,
  applyRetry,
};
