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

function readArrayField(raw, defaults, fieldName) {
  if (typeof raw[fieldName] === "undefined") {
    return defaults[fieldName] || [];
  }
  assertArrayOfStrings(raw[fieldName], fieldName);
  return raw[fieldName];
}

function readObjectField(raw, defaults, fieldName) {
  if (typeof raw[fieldName] === "undefined") {
    return defaults[fieldName] || {};
  }
  if (!raw[fieldName] || typeof raw[fieldName] !== "object" || Array.isArray(raw[fieldName])) {
    throw new Error(`invalid task result field "${fieldName}": expected object`);
  }
  return raw[fieldName];
}

function normalizeTaskResult(raw = {}, defaults = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("task result must be an object");
  }

  const result = {
    status: raw.status || defaults.status || "succeeded",
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : (defaults.summary || ""),
    changed_files: readArrayField(raw, defaults, "changed_files"),
    blockers: readArrayField(raw, defaults, "blockers"),
    next_actions: readArrayField(raw, defaults, "next_actions"),
    tests_run: readArrayField(raw, defaults, "tests_run"),
    artifacts: readObjectField(raw, defaults, "artifacts"),
    next_task_status: typeof raw.next_task_status === "string" ? raw.next_task_status : (defaults.next_task_status || ""),
    handoff: typeof raw.handoff === "string" ? raw.handoff : (defaults.handoff || ""),
  };

  if (!ALLOWED_RESULT_STATUSES.has(result.status)) {
    throw new Error(`invalid task result status: ${result.status}`);
  }

  if (result.next_task_status && !ALLOWED_NEXT_TASK_STATUSES.has(result.next_task_status)) {
    throw new Error(`invalid task result next_task_status: ${result.next_task_status}`);
  }

  if (typeof result.summary !== "string") {
    throw new Error('invalid task result field "summary": expected string');
  }
  if (typeof result.handoff !== "string") {
    throw new Error('invalid task result field "handoff": expected string');
  }

  return result;
}

module.exports = {
  normalizeTaskResult,
};
