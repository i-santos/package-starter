"use strict";

const path = require("node:path");
const { setInterval, clearInterval } = require("node:timers");
const { loadProject, withGraphMutation, reloadGraph, saveBoard } = require("./project");
const { getTaskById } = require("./task-graph");
const { appendEvent } = require("./event-bus");
const { writeHeartbeat, clearHeartbeat } = require("./heartbeat");
const { prepareExecutionContract, buildExecutionEnv, finalizeExecutionContract } = require("./execution-contract");
const { evaluateWorkflowDecision, applyWorkflowDecision, resolveCompletedExecution, applyFailedExecutionPolicy } = require("./execution-policy");
const { syncProjectContext, syncTaskContext, writeTaskHandoff } = require("./context-store");
const { normalizeTaskResult } = require("./task-result");
const { execShellCommand } = require("../utils/process");
const { removeFileIfExists, appendText, readJsonIfExists } = require("../utils/fs");

async function runTaskCommand(project, task) {
  const logPath = path.join(project.paths.agentLogsDir, `${task.id}.log`);
  await syncProjectContext(project);
  await syncTaskContext(project, task);
  const contract = await prepareExecutionContract(project, task);
  const env = {
    ...process.env,
    ADMIRAL_ROOT: project.root,
    ADMIRAL_TASK_ID: task.id,
    ADMIRAL_TASK_TITLE: task.title,
    ADMIRAL_TASK_SCOPE: task.scope,
    ADMIRAL_TASK_BRANCH: task.branch || "",
    ADMIRAL_TASK_WORKSPACE: task.workspace || "",
    ...buildExecutionEnv(contract),
  };

  try {
    if (task.hooks && task.hooks["pre-run"]) {
      await execShellCommand(task.hooks["pre-run"], {
        cwd: task.workspace || project.root,
        env,
      });
    }

    const result = await execShellCommand(contract.command.agent_command, {
      cwd: task.workspace || project.root,
      env,
      allowFailure: true,
    });

    if (result.stdout) {
      await appendText(logPath, result.stdout);
    }
    if (result.stderr) {
      await appendText(logPath, result.stderr);
    }

    if (result.code !== 0) {
      throw new Error(`agent command failed with code ${result.code}`);
    }

    if (task.hooks && task.hooks["post-run"]) {
      await execShellCommand(task.hooks["post-run"], {
        cwd: task.workspace || project.root,
        env,
      });
    }

    const structuredResult = normalizeTaskResult(
      await readJsonIfExists(contract.files.workspace_result, {}),
      {
        status: "succeeded",
        summary: "Execution completed successfully.",
      },
      {
        workflowStatus: contract.command.workflow_status,
      }
    );

    const finalized = await finalizeExecutionContract(contract, {
      ...structuredResult,
      completed_at: new Date().toISOString(),
      exit_code: result.code,
      stdout_present: Boolean(result.stdout),
      stderr_present: Boolean(result.stderr),
    });

    return finalized;
  } catch (error) {
    const finalized = await finalizeExecutionContract(contract, {
      status: "failed",
      summary: "Execution failed.",
      completed_at: new Date().toISOString(),
      exit_code: typeof error.code === "number" ? error.code : 1,
      blockers: [error.message],
      error: error.message,
    });
    error.executionContract = finalized;
    throw error;
  }
}

async function main() {
  const [repoRoot, taskId] = process.argv.slice(2);
  if (!repoRoot || !taskId) {
    throw new Error("worker requires <repo-root> <task-id>");
  }

  process.chdir(repoRoot);
  const project = await loadProject(repoRoot);
  let task = getTaskById(project.graph, taskId);

  await withGraphMutation(project, (graph) => {
    const freshTask = getTaskById(graph, taskId);
    freshTask.status = "running";
    return graph;
  });
  await reloadGraph(project);
  task = getTaskById(project.graph, taskId);
  await syncProjectContext(project);
  await syncTaskContext(project, task);

  const heartbeatTick = async () => {
    await writeHeartbeat(project, {
      agent: task.agent,
      task_id: task.id,
      status: "running",
    });
  };

  await heartbeatTick();
  const interval = setInterval(() => {
    heartbeatTick().catch(() => {});
  }, Math.max(1000, Math.floor(project.config.heartbeat_timeout_ms / 3)));

  try {
    const contract = await runTaskCommand(project, task);
    const workflowDecision = evaluateWorkflowDecision(task, contract);
    const decision = resolveCompletedExecution(contract, workflowDecision);
    await withGraphMutation(project, (graph) => {
      const freshTask = getTaskById(graph, taskId);
      applyWorkflowDecision(freshTask, workflowDecision);
      freshTask.status = decision.schedulerStatus;
      freshTask.metadata = {
        ...(freshTask.metadata || {}),
        execution: {
          last_execution_id: contract.execution_id,
          last_status: contract.result.status,
          last_started_at: contract.started_at,
          last_completed_at: new Date().toISOString(),
          contract_file: contract.files.workspace_contract,
          result_file: contract.files.workspace_result,
          runtime_record: contract.files.runtime_record,
          last_summary: contract.result.summary,
          last_blockers: contract.result.blockers || [],
          last_next_actions: contract.result.next_actions || [],
          last_stage_output: contract.result.stage_output || {},
          last_decision: decision.schedulerStatus,
          last_workflow_action: workflowDecision.action,
          last_workflow_status: workflowDecision.nextStatus,
          last_workflow_reason: workflowDecision.reason,
          last_recommended_action: decision.recommendedAction,
        },
      };
      return graph;
    });
    await reloadGraph(project);
    task = getTaskById(project.graph, taskId);
    await syncTaskContext(project, task);
    await writeTaskHandoff(project, task, {
      execution_id: contract.execution_id,
      summary: contract.result.summary,
      changed_files: contract.result.changed_files || [],
      next_actions: contract.result.next_actions || [],
      blockers: contract.result.blockers || [],
      tests_run: contract.result.tests_run || [],
      handoff: contract.result.handoff || "",
      stage_output: contract.result.stage_output || {},
      result_file: contract.files.workspace_result,
    });
    await appendEvent(project, decision.eventName, taskId, task.agent, {
      scheduler_status: decision.schedulerStatus,
      recommended_action: decision.recommendedAction,
      result_status: contract.result.status,
      workflow_action: workflowDecision.action,
      workflow_status: workflowDecision.nextStatus,
      workflow_reason: workflowDecision.reason,
    });
    if (workflowDecision.action === "advance") {
      await appendEvent(project, "TASK_WORKFLOW_AUTO_ADVANCED", taskId, task.agent, {
        workflow_status: workflowDecision.nextStatus,
        reason: workflowDecision.reason,
      });
    } else if (workflowDecision.action === "rework") {
      await appendEvent(project, "TASK_WORKFLOW_REWORK_REQUIRED", taskId, task.agent, {
        workflow_status: workflowDecision.nextStatus,
        reason: workflowDecision.reason,
      });
    }
  } catch (error) {
    const failedAt = new Date().toISOString();
    const executionContract = error.executionContract || null;
    let failureDecision;
    await withGraphMutation(project, (graph) => {
      const freshTask = getTaskById(graph, taskId);
      failureDecision = applyFailedExecutionPolicy(freshTask, project.config, error, executionContract);
      const lastExecution = freshTask.metadata && freshTask.metadata.execution ? freshTask.metadata.execution : {};
      freshTask.metadata = {
        ...(freshTask.metadata || {}),
        execution: {
          ...lastExecution,
          last_status: executionContract && executionContract.result ? executionContract.result.status : "failed",
          last_completed_at: failedAt,
          last_summary: failureDecision.summary,
          last_blockers: failureDecision.blockers,
          last_next_actions: failureDecision.nextActions,
          last_error: error.message,
          last_failure_kind: failureDecision.failureKind,
          last_decision: failureDecision.finalStatus,
        },
      };
      return graph;
    });
    await reloadGraph(project);
    task = getTaskById(project.graph, taskId);
    await syncTaskContext(project, task);
    await writeTaskHandoff(project, task, {
      summary: failureDecision.summary,
      blockers: failureDecision.blockers,
      next_actions: failureDecision.nextActions,
    });
    await appendEvent(project, failureDecision.eventName, taskId, task.agent, {
      error: error.message,
      failure_kind: failureDecision.failureKind,
      retryable: failureDecision.retryable,
      scheduler_status: failureDecision.finalStatus,
    });
    process.exitCode = 1;
  } finally {
    clearInterval(interval);
    await clearHeartbeat(project, task.agent);
    await removeFileIfExists(path.join(project.paths.runtimePidsDir, `${task.id}.json`));
    await saveBoard(project);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
