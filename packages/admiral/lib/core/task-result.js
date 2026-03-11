"use strict";

const ALLOWED_RESULT_STATUSES = new Set(["succeeded", "failed", "blocked"]);
const ALLOWED_NEXT_TASK_STATUSES = new Set(["review", "blocked", "done"]);

function assertArrayOfStrings(value, fieldName) {
  if (typeof value === "undefined") {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`invalid task result field "${fieldName}": expected array of strings`);
  }
}

function normalizeTaskResult(raw = {}, defaults = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("task result must be an object");
  }

  const result = {
    status: raw.status || defaults.status || "succeeded",
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : (defaults.summary || ""),
    changed_files: Array.isArray(raw.changed_files) ? raw.changed_files : (defaults.changed_files || []),
    blockers: Array.isArray(raw.blockers) ? raw.blockers : (defaults.blockers || []),
    next_actions: Array.isArray(raw.next_actions) ? raw.next_actions : (defaults.next_actions || []),
    tests_run: Array.isArray(raw.tests_run) ? raw.tests_run : (defaults.tests_run || []),
    artifacts: raw.artifacts && typeof raw.artifacts === "object" && !Array.isArray(raw.artifacts) ? raw.artifacts : (defaults.artifacts || {}),
    next_task_status: typeof raw.next_task_status === "string" ? raw.next_task_status : (defaults.next_task_status || ""),
    handoff: typeof raw.handoff === "string" ? raw.handoff : (defaults.handoff || ""),
  };

  if (!ALLOWED_RESULT_STATUSES.has(result.status)) {
    throw new Error(`invalid task result status: ${result.status}`);
  }

  if (result.next_task_status && !ALLOWED_NEXT_TASK_STATUSES.has(result.next_task_status)) {
    throw new Error(`invalid task result next_task_status: ${result.next_task_status}`);
  }

  assertArrayOfStrings(result.changed_files, "changed_files");
  assertArrayOfStrings(result.blockers, "blockers");
  assertArrayOfStrings(result.next_actions, "next_actions");
  assertArrayOfStrings(result.tests_run, "tests_run");

  if (typeof result.summary !== "string") {
    throw new Error('invalid task result field "summary": expected string');
  }
  if (typeof result.handoff !== "string") {
    throw new Error('invalid task result field "handoff": expected string');
  }
  if (!result.artifacts || typeof result.artifacts !== "object" || Array.isArray(result.artifacts)) {
    throw new Error('invalid task result field "artifacts": expected object');
  }

  return result;
}

module.exports = {
  normalizeTaskResult,
};
