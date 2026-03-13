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

function assertStringField(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`invalid task result field "${fieldName}": expected string`);
  }
}

function assertObjectOfStrings(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid task result field "${fieldName}": expected object`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error(`invalid task result field "${fieldName}.${key}": expected string`);
    }
  }
}

function validatePlanningOutput(stageOutput) {
  const value = stageOutput.plan;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('invalid task result field "stage_output.plan": expected object');
  }
  assertArrayOfStrings(value.goals, "stage_output.plan.goals");
  assertArrayOfStrings(value.constraints, "stage_output.plan.constraints");
  assertArrayOfStrings(value.risks, "stage_output.plan.risks");
  assertArrayOfStrings(value.implementation_steps, "stage_output.plan.implementation_steps");
}

function validateImplementationOutput(stageOutput) {
  const value = stageOutput.implementation;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('invalid task result field "stage_output.implementation": expected object');
  }
  assertArrayOfStrings(value.changed_files, "stage_output.implementation.changed_files");
  assertArrayOfStrings(value.tradeoffs, "stage_output.implementation.tradeoffs");
  assertArrayOfStrings(value.pending_risks, "stage_output.implementation.pending_risks");
}

function validateVerificationOutput(stageOutput) {
  const value = stageOutput.verification;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('invalid task result field "stage_output.verification": expected object');
  }
  assertObjectOfStrings(value.checks, "stage_output.verification.checks");
  assertArrayOfStrings(value.issues, "stage_output.verification.issues");
  assertStringField(value.recommendation, "stage_output.verification.recommendation");
}

function validateReleaseReadinessOutput(stageOutput) {
  const value = stageOutput.release_readiness;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('invalid task result field "stage_output.release_readiness": expected object');
  }
  assertStringField(value.status, "stage_output.release_readiness.status");
  assertArrayOfStrings(value.reasons, "stage_output.release_readiness.reasons");
}

function validateStageOutput(stageOutput, workflowStatus) {
  if (!stageOutput || typeof stageOutput !== "object" || Array.isArray(stageOutput)) {
    throw new Error('invalid task result field "stage_output": expected object');
  }

  if (workflowStatus === "new" || workflowStatus === "planned") {
    validatePlanningOutput(stageOutput);
    return;
  }
  if (workflowStatus === "tdd_ready") {
    validateImplementationOutput(stageOutput);
    return;
  }
  if (workflowStatus === "implemented") {
    validateVerificationOutput(stageOutput);
    return;
  }
  if (workflowStatus === "verified" || workflowStatus === "publish_ready") {
    validateReleaseReadinessOutput(stageOutput);
  }
}

function getStageResultContract(workflowStatus) {
  if (workflowStatus === "new" || workflowStatus === "planned") {
    return {
      key: "plan",
      required_fields: ["goals", "constraints", "risks", "implementation_steps"],
    };
  }
  if (workflowStatus === "tdd_ready") {
    return {
      key: "implementation",
      required_fields: ["changed_files", "tradeoffs", "pending_risks"],
    };
  }
  if (workflowStatus === "implemented") {
    return {
      key: "verification",
      required_fields: ["checks", "issues", "recommendation"],
    };
  }
  if (workflowStatus === "verified" || workflowStatus === "publish_ready") {
    return {
      key: "release_readiness",
      required_fields: ["status", "reasons"],
    };
  }
  return {
    key: "",
    required_fields: [],
  };
}

function normalizeTaskResult(raw = {}, defaults = {}, options = {}) {
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
    stage_output: readObjectField(raw, defaults, "stage_output"),
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
  if (result.status === "succeeded" && options.workflowStatus) {
    validateStageOutput(result.stage_output, options.workflowStatus);
  }

  return result;
}

module.exports = {
  getStageResultContract,
  normalizeTaskResult,
};
