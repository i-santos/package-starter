"use strict";

const path = require("node:path");
const { mkdir, writeFile } = require("node:fs/promises");
const { writeJson, readJsonIfExists } = require("../utils/fs");

function createExecutionId(taskId, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${taskId}-${stamp}`;
}

function buildExecutionContract(project, task, now = new Date()) {
  const executionId = createExecutionId(task.id, now);
  const workspace = task.workspace || project.root;
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
      scheduler_status: task.status,
      branch: task.branch || "",
      workspace,
      agent: task.agent,
      depends_on: Array.isArray(task.depends_on) ? [...task.depends_on] : [],
      metadata: task.metadata || {},
    },
    command: {
      agent_command: project.config.agent_command,
      pre_run: task.hooks && task.hooks["pre-run"] ? task.hooks["pre-run"] : "",
      post_run: task.hooks && task.hooks["post-run"] ? task.hooks["post-run"] : "",
    },
    files: {
      runtime_record: runtimeRecordPath,
      workspace_contract: workspaceContractPath,
      workspace_result: workspaceResultPath,
      log: logPath,
    },
  };
}

function buildExecutionEnv(contract) {
  return {
    ADMIRAL_EXECUTION_ID: contract.execution_id,
    ADMIRAL_EXECUTION_FILE: contract.files.workspace_contract,
    ADMIRAL_RESULT_FILE: contract.files.workspace_result,
    ADMIRAL_LOG_FILE: contract.files.log,
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
  const next = {
    ...contract,
    result: {
      ...(contract.result || {}),
      ...update,
    },
  };

  await writeJson(contract.files.runtime_record, next);
  await writeJson(contract.files.workspace_contract, next);

  const existingResult = await readJsonIfExists(contract.files.workspace_result, {});
  await writeJson(contract.files.workspace_result, {
    ...existingResult,
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
