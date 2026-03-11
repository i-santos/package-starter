"use strict";

const path = require("node:path");
const { mkdir, writeFile } = require("node:fs/promises");
const { writeJson, readJsonIfExists } = require("../utils/fs");
const { getTaskContextPath, getTaskHandoffPath } = require("./context-store");
const { resolveTaskAssignment } = require("./agent-profiles");
const { readTaskRecord } = require("@i-santos/workflow");
const { getStageResultContract } = require("./task-result");

function createExecutionId(taskId, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${taskId}-${stamp}`;
}

function buildExecutionContract(project, task, now = new Date()) {
  const executionId = createExecutionId(task.id, now);
  const workspace = task.workspace || project.root;
  const assignment = resolveTaskAssignment(project, task);
  const profile = assignment.resolvedProfile;
  const workflow = readTaskRecord(task);
  const previousStage = ({
    new: "",
    planned: "",
    tdd_ready: "planned",
    implemented: "tdd_ready",
    verified: "implemented",
    publish_ready: "verified",
    released: "publish_ready",
  }[assignment.workflowStatus] || "");
  const previousStageHandoff = previousStage && workflow.stage_handoffs
    ? workflow.stage_handoffs[previousStage] || null
    : null;
  const stageResultContract = getStageResultContract(assignment.workflowStatus);
  const runtimeRecordPath = path.join(project.paths.runtimeExecutionsDir, `${task.id}.json`);
  const workspaceDir = path.join(workspace, ".admiral");
  const workspaceContractPath = path.join(workspaceDir, "task-execution.json");
  const workspaceResultPath = path.join(workspaceDir, "task-result.json");
  const logPath = path.join(project.paths.agentLogsDir, `${task.id}.log`);

  return {
    version: 1,
    execution_id: executionId,
    started_at: now.toISOString(),
    project: {
      root: project.root,
      default_branch: project.config.default_branch,
    },
    task: {
      id: task.id,
      title: task.title,
      scope: task.scope,
      profile: assignment.taskProfile,
      scheduler_status: task.status,
      workflow_status: assignment.workflowStatus,
      stage_profile: assignment.stageProfile,
      active_profile: profile.name,
      branch: task.branch || "",
      workspace,
      agent: task.agent,
      capabilities: profile.capabilities,
      depends_on: Array.isArray(task.depends_on) ? [...task.depends_on] : [],
      metadata: task.metadata || {},
    },
    command: {
      agent_command: profile.command,
      profile: profile.name,
      capabilities: profile.capabilities,
      workflow_status: assignment.workflowStatus,
      task_profile: assignment.taskProfile,
      stage_profile: assignment.stageProfile,
      result_contract: stageResultContract,
      pre_run: task.hooks && task.hooks["pre-run"] ? task.hooks["pre-run"] : "",
      post_run: task.hooks && task.hooks["post-run"] ? task.hooks["post-run"] : "",
    },
    files: {
      runtime_record: runtimeRecordPath,
      workspace_contract: workspaceContractPath,
      workspace_result: workspaceResultPath,
      log: logPath,
    },
    context: {
      project_file: project.paths.contextProject,
      task_file: getTaskContextPath(project, task.id),
      handoff_file: getTaskHandoffPath(project, task.id),
      previous_stage: previousStage,
      previous_stage_handoff: previousStageHandoff,
    },
  };
}

function buildExecutionEnv(contract) {
  return {
    ADMIRAL_EXECUTION_ID: contract.execution_id,
    ADMIRAL_EXECUTION_FILE: contract.files.workspace_contract,
    ADMIRAL_RESULT_FILE: contract.files.workspace_result,
    ADMIRAL_LOG_FILE: contract.files.log,
    ADMIRAL_WORKFLOW_STATUS: contract.command.workflow_status,
    ADMIRAL_AGENT_PROFILE: contract.command.profile,
    ADMIRAL_TASK_PROFILE: contract.command.task_profile,
    ADMIRAL_STAGE_PROFILE: contract.command.stage_profile,
    ADMIRAL_AGENT_CAPABILITIES: Array.isArray(contract.command.capabilities) ? contract.command.capabilities.join(",") : "",
  };
}

async function prepareExecutionContract(project, task, now = new Date()) {
  const contract = buildExecutionContract(project, task, now);
  await mkdir(path.dirname(contract.files.workspace_contract), { recursive: true });
  await writeJson(contract.files.runtime_record, contract);
  await writeJson(contract.files.workspace_contract, contract);
  return contract;
}

async function finalizeExecutionContract(contract, update) {
  const existingResult = await readJsonIfExists(contract.files.workspace_result, {});
  const next = {
    ...contract,
    result: {
      ...(contract.result || {}),
      ...existingResult,
      ...update,
    },
  };

  await writeJson(contract.files.runtime_record, next);
  await writeJson(contract.files.workspace_contract, next);
  await writeJson(contract.files.workspace_result, {
    execution_id: contract.execution_id,
    ...next.result,
  });

  return next;
}

module.exports = {
  buildExecutionContract,
  buildExecutionEnv,
  prepareExecutionContract,
  finalizeExecutionContract,
};
