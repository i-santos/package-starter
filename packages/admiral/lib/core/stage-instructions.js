"use strict";

function buildCommonRules() {
  return [
    "Read `.admiral/task-execution.json` before making changes.",
    "Use `.admiral/context/project.json`, `.admiral/context/tasks/<task-id>.json`, and `.admiral/context/handoffs/<task-id>.json` as the source of persisted context.",
    "Write the execution result to `.admiral/task-result.json` using valid JSON.",
    "Always include `status`, `summary`, and `stage_output` in the result file.",
    "Use `status: \"blocked\"` when human input or an external dependency is required.",
    "Use `blockers` and `next_actions` to explain what the operator should do next.",
  ];
}

function getStageGuidance(workflowStatus) {
  if (workflowStatus === "new" || workflowStatus === "planned") {
    return {
      stage: "planning",
      objective: "Understand the task and produce a concrete plan for implementation.",
      expected_output: "stage_output.plan",
      checklist: [
        "Inspect current code and task context before planning.",
        "List implementation goals.",
        "List constraints that must be preserved.",
        "List risks or unknowns.",
        "List concrete implementation steps in execution order.",
      ],
      result_example: {
        status: "succeeded",
        summary: "Planned the backend auth task.",
        next_actions: ["review plan", "run implementation stage"],
        stage_output: {
          plan: {
            goals: ["Implement backend auth flow"],
            constraints: ["Keep public API stable"],
            risks: ["Potential auth regression"],
            implementation_steps: ["Inspect current auth code", "Implement flow", "Update tests"],
          },
        },
      },
    };
  }

  if (workflowStatus === "tdd_ready") {
    return {
      stage: "implementation",
      objective: "Implement the scoped changes described by the plan and TDD context.",
      expected_output: "stage_output.implementation",
      checklist: [
        "Use the prior plan and TDD handoff as input.",
        "Apply code changes inside the task workspace.",
        "Record changed files.",
        "Record tradeoffs or design compromises.",
        "Record pending risks that should be verified later.",
      ],
      result_example: {
        status: "succeeded",
        summary: "Implemented backend auth changes.",
        changed_files: ["src/backend/auth.js", "tests/auth.test.js"],
        next_actions: ["run verification stage"],
        stage_output: {
          implementation: {
            changed_files: ["src/backend/auth.js", "tests/auth.test.js"],
            tradeoffs: ["Kept legacy token parser for compatibility"],
            pending_risks: ["Integration coverage still limited"],
          },
        },
      },
    };
  }

  if (workflowStatus === "implemented") {
    return {
      stage: "verification",
      objective: "Verify the implementation and decide whether it is ready for release preparation or needs rework.",
      expected_output: "stage_output.verification",
      checklist: [
        "Review the implementation handoff and changed files.",
        "Run or inspect relevant checks.",
        "Report check results as strings.",
        "List issues that require rework if any exist.",
        "Set recommendation to `ready_for_release` only when the task is genuinely ready.",
      ],
      result_example: {
        status: "succeeded",
        summary: "Verified backend auth successfully.",
        tests_run: ["unit", "integration"],
        stage_output: {
          verification: {
            checks: {
              unit: "pass",
              integration: "pass",
              e2e: "not_required",
            },
            issues: [],
            recommendation: "ready_for_release",
          },
        },
      },
    };
  }

  if (workflowStatus === "verified" || workflowStatus === "publish_ready") {
    return {
      stage: "release_readiness",
      objective: "Assess whether the task is ready for delivery/release handoff.",
      expected_output: "stage_output.release_readiness",
      checklist: [
        "Review verification output and remaining risks.",
        "Decide whether the task is release-ready or needs changes.",
        "Use `status: ready` only if the task is suitable for PR/release handoff.",
        "Explain the reasons for the decision.",
      ],
      result_example: {
        status: "succeeded",
        summary: "Release readiness confirmed.",
        stage_output: {
          release_readiness: {
            status: "ready",
            reasons: ["Checks passed", "No unresolved blockers"],
          },
        },
      },
    };
  }

  return {
    stage: "generic",
    objective: "Inspect the task context and produce a valid structured result.",
    expected_output: "stage_output",
    checklist: ["Read the task context", "Write a valid task-result.json"],
    result_example: {
      status: "succeeded",
      summary: "Execution completed.",
      stage_output: {},
    },
  };
}

function buildStageInstructions(contract) {
  const guidance = getStageGuidance(contract.command.workflow_status);
  const resultContract = contract.command.result_contract || { key: "", required_fields: [] };

  return [
    `# Admiral Agent Instructions`,
    "",
    `Task: ${contract.task.id}`,
    `Workflow status: ${contract.command.workflow_status}`,
    `Stage: ${guidance.stage}`,
    `Active profile: ${contract.command.profile}`,
    "",
    `## Objective`,
    guidance.objective,
    "",
    `## Inputs`,
    `- Execution contract: ${contract.files.workspace_contract}`,
    `- Project context: ${contract.context.project_file}`,
    `- Task context: ${contract.context.task_file}`,
    `- Handoff history: ${contract.context.handoff_file}`,
    "",
    `## Result Contract`,
    `- Result key: ${resultContract.key || "-"}`,
    `- Required fields: ${(resultContract.required_fields || []).join(", ") || "-"}`,
    "",
    `## Rules`,
    ...buildCommonRules().map((item) => `- ${item}`),
    "",
    `## Stage Checklist`,
    ...guidance.checklist.map((item) => `- ${item}`),
    "",
    `## Example Result`,
    "```json",
    JSON.stringify(guidance.result_example, null, 2),
    "```",
    "",
  ].join("\n");
}

module.exports = {
  buildStageInstructions,
};
