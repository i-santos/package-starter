"use strict";

const { applyRetry } = require("./retry-policy");

function inferFailureKind(error, executionContract) {
  const message = error && error.message ? error.message : "";

  if (executionContract && executionContract.result && executionContract.result.status === "blocked") {
    return "blocked";
  }
  if (message.includes("invalid task result")) {
    return "contract_invalid";
  }
  if (message.includes("agent command failed with code")) {
    return "agent_exit";
  }
  return "runtime_error";
}

function resolveCompletedExecution(contract) {
  const result = contract.result || {};
  const schedulerStatus = result.next_task_status
    || (result.status === "blocked" || (result.blockers || []).length > 0 ? "blocked" : "review");

  let eventName = "TASK_DONE";
  if (schedulerStatus === "blocked") {
    eventName = "TASK_BLOCKED";
  } else if (schedulerStatus === "done") {
    eventName = "TASK_COMPLETED";
  }

  return {
    schedulerStatus,
    eventName,
  };
}

function applyFailedExecutionPolicy(task, config, error, executionContract) {
  const failureKind = inferFailureKind(error, executionContract);
  const retryable = failureKind !== "contract_invalid";
  const result = executionContract && executionContract.result ? executionContract.result : {};
  const applied = applyRetry(task, config, { retryable });

  return {
    task: applied,
    failureKind,
    retryable,
    finalStatus: applied.status,
    eventName: applied.status === "retry_wait" ? "TASK_RETRY_SCHEDULED" : "TASK_FAILED",
    summary: result.summary || "Execution failed.",
    blockers: result.blockers || [error.message],
    nextActions: result.next_actions || [],
  };
}

module.exports = {
  resolveCompletedExecution,
  applyFailedExecutionPolicy,
  inferFailureKind,
};
