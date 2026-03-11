"use strict";

const { applyRetry } = require("./retry-policy");
const { readTaskRecord, transitionTask } = require("@i-santos/workflow");

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

function evaluateWorkflowDecision(task, contract) {
  const workflow = readTaskRecord(task);
  const result = contract.result || {};
  const stageOutput = result.stage_output || {};

  if (result.status === "blocked" || (result.blockers || []).length > 0) {
    return {
      action: "blocked",
      currentStatus: workflow.status,
      nextStatus: workflow.status,
      reason: "Execution reported blockers.",
    };
  }

  if (workflow.status === "new") {
    return {
      action: "advance",
      currentStatus: workflow.status,
      nextStatus: "planned",
      reason: "Planning output captured for a new task.",
    };
  }

  if (workflow.status === "planned") {
    return {
      action: "advance",
      currentStatus: workflow.status,
      nextStatus: "tdd_ready",
      reason: "Planning stage is complete and ready for TDD.",
    };
  }

  if (workflow.status === "tdd_ready") {
    return {
      action: "advance",
      currentStatus: workflow.status,
      nextStatus: "implemented",
      reason: "Implementation output is available.",
    };
  }

  if (workflow.status === "implemented") {
    const verification = stageOutput.verification || {};
    if (Array.isArray(verification.issues) && verification.issues.length > 0) {
      return {
        action: "rework",
        currentStatus: workflow.status,
        nextStatus: "implemented",
        reason: "Verification reported issues that require implementation changes.",
      };
    }

    if (verification.recommendation === "ready_for_release") {
      return {
        action: "advance",
        currentStatus: workflow.status,
        nextStatus: "verified",
        reason: "Verification approved the task for release preparation.",
      };
    }
  }

  if (workflow.status === "verified") {
    const releaseReadiness = stageOutput.release_readiness || {};
    if (releaseReadiness.status === "ready") {
      return {
        action: "advance",
        currentStatus: workflow.status,
        nextStatus: "publish_ready",
        reason: "Release readiness checks passed.",
      };
    }
    if (releaseReadiness.status === "changes_required") {
      return {
        action: "rework",
        currentStatus: workflow.status,
        nextStatus: "implemented",
        reason: "Release readiness requires implementation changes.",
      };
    }
  }

  if (workflow.status === "publish_ready") {
    return {
      action: "hold",
      currentStatus: workflow.status,
      nextStatus: workflow.status,
      reason: "Task is waiting for delivery and release operations.",
    };
  }

  return {
    action: "hold",
    currentStatus: workflow.status,
    nextStatus: workflow.status,
    reason: "No automatic workflow transition was derived from the execution result.",
  };
}

function applyWorkflowDecision(task, decision) {
  if (decision.action === "advance" && decision.nextStatus !== decision.currentStatus) {
    const nextWorkflow = transitionTask(readTaskRecord(task), decision.nextStatus, new Date().toISOString());
    task.metadata = {
      ...(task.metadata || {}),
      workflow: nextWorkflow,
    };
  } else if (decision.action === "rework" && decision.nextStatus !== decision.currentStatus) {
    const nextWorkflow = transitionTask(readTaskRecord(task), decision.nextStatus, new Date().toISOString());
    task.metadata = {
      ...(task.metadata || {}),
      workflow: nextWorkflow,
    };
  }

  return task;
}

function resolveCompletedExecution(contract, workflowDecision) {
  const result = contract.result || {};
  let schedulerStatus = result.next_task_status
    || (result.status === "blocked" || (result.blockers || []).length > 0 ? "blocked" : "review");

  if (!result.next_task_status && workflowDecision && workflowDecision.action === "rework") {
    schedulerStatus = "todo";
  }

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
  evaluateWorkflowDecision,
  applyWorkflowDecision,
  resolveCompletedExecution,
  applyFailedExecutionPolicy,
  inferFailureKind,
};
