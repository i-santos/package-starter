"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp, readFile, writeFile } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { execFile } = require("../lib/utils/process");

const CLI_PATH = path.join(__dirname, "..", "bin", "admiral");

async function createTempRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "admiral-test-"));
  await execFile("git", ["init", "-b", "main"], { cwd: repoDir });
  await execFile("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  await execFile("git", ["config", "user.name", "Admiral Test"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "README.md"), "# temp\n", "utf8");
  await execFile("git", ["add", "."], { cwd: repoDir });
  await execFile("git", ["commit", "-m", "init"], { cwd: repoDir });
  return repoDir;
}

async function runCli(args, cwd) {
  return execFile(process.execPath, [CLI_PATH, ...args], {
    cwd,
    env: {
      ...process.env,
      SHELL: "/bin/sh",
    },
  });
}

test("admiral init creates runtime structure", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const config = JSON.parse(await readFile(path.join(repoDir, ".admiral", "config.json"), "utf8"));
  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));

  assert.equal(config.default_branch, "main");
  assert.deepEqual(graph.tasks, []);
  assert.equal(typeof JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "project.json"), "utf8")).project.root, "string");
});

test("admiral can create tasks with dependencies", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);
  await runCli(["task", "create", "backend-auth", "--scope", "backend"], repoDir);
  await runCli(["task", "create", "frontend-login", "--scope", "frontend", "--depends-on", "backend-auth"], repoDir);

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  assert.equal(graph.tasks.length, 2);
  assert.deepEqual(graph.tasks.find((task) => task.id === "frontend-login").depends_on, ["backend-auth"]);
  assert.equal(graph.tasks.find((task) => task.id === "backend-auth").metadata.workflow.status, "new");
  const taskContext = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "tasks", "backend-auth.json"), "utf8"));
  assert.equal(taskContext.task.id, "backend-auth");
  assert.equal(taskContext.workflow.status, "new");
});

test("admiral task workflow lifecycle persists metadata and artifacts", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  await runCli(["task", "create", "platform-auth", "--title", "Platform auth"], repoDir);

  await runCli(["task", "plan", "platform-auth"], repoDir);
  let graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  let task = graph.tasks.find((item) => item.id === "platform-auth");
  assert.equal(task.metadata.workflow.status, "planned");
  assert.equal(await readFile(path.join(repoDir, task.metadata.workflow.artifacts.planFile), "utf8").then(Boolean), true);

  await runCli(["task", "tdd", "platform-auth"], repoDir);
  graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  task = graph.tasks.find((item) => item.id === "platform-auth");
  assert.equal(task.metadata.workflow.status, "tdd_ready");
  assert.equal(await readFile(path.join(repoDir, task.metadata.workflow.artifacts.tddFile), "utf8").then(Boolean), true);

  await runCli(["task", "implement", "platform-auth"], repoDir);
  graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  task = graph.tasks.find((item) => item.id === "platform-auth");
  assert.equal(task.metadata.workflow.status, "implemented");

  await runCli(["task", "verify", "platform-auth"], repoDir);
  graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  task = graph.tasks.find((item) => item.id === "platform-auth");
  assert.equal(task.metadata.workflow.status, "verified");
  assert.equal(task.metadata.workflow.checks.unit, "pass");

  await runCli(["task", "publish-ready", "platform-auth"], repoDir);
  graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  task = graph.tasks.find((item) => item.id === "platform-auth");
  assert.equal(task.metadata.workflow.status, "publish_ready");
  assert.equal(task.status, "todo");
});

test("scheduler moves a successful task to review", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"const fs=require('node:fs');fs.writeFileSync('done.txt', process.env.ADMIRAL_TASK_ID);fs.writeFileSync(process.env.ADMIRAL_RESULT_FILE, JSON.stringify({status:'succeeded',summary:'Implemented backend auth',changed_files:['src/backend/auth.js'],next_actions:['open pr'],tests_run:['unit'],artifacts:{report:'docs/tests/backend-auth.md'},ok:true,taskId:process.env.ADMIRAL_TASK_ID}, null, 2));\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth", "--scope", "general"], repoDir);
  await runCli(["run", "--once"], repoDir);

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "review");
  assert.ok(task.workspace);
  assert.equal(task.metadata.execution.last_status, "succeeded");
  assert.ok(task.metadata.execution.contract_file);
  assert.ok(task.metadata.execution.result_file);

  const artifact = await readFile(path.join(task.workspace, "done.txt"), "utf8");
  assert.equal(artifact, "backend-auth");
  const contract = JSON.parse(await readFile(path.join(task.workspace, ".admiral", "task-execution.json"), "utf8"));
  const result = JSON.parse(await readFile(path.join(task.workspace, ".admiral", "task-result.json"), "utf8"));
  const projectContext = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "project.json"), "utf8"));
  const taskContext = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "tasks", "backend-auth.json"), "utf8"));
  const handoff = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "handoffs", "backend-auth.json"), "utf8"));
  assert.equal(contract.task.id, "backend-auth");
  assert.equal(contract.files.workspace_result, path.join(task.workspace, ".admiral", "task-result.json"));
  assert.equal(contract.context.project_file, path.join(repoDir, ".admiral", "context", "project.json"));
  assert.equal(contract.context.task_file, path.join(repoDir, ".admiral", "context", "tasks", "backend-auth.json"));
  assert.equal(result.status, "succeeded");
  assert.equal(result.summary, "Implemented backend auth");
  assert.deepEqual(result.changed_files, ["src/backend/auth.js"]);
  assert.equal(result.ok, true);
  assert.equal(projectContext.project.default_branch, "main");
  assert.equal(taskContext.execution.last_status, "succeeded");
  assert.equal(taskContext.execution.last_summary, "Implemented backend auth");
  assert.deepEqual(taskContext.execution.last_next_actions, ["open pr"]);
  assert.equal(handoff.latest.summary, "Implemented backend auth");
  assert.deepEqual(handoff.latest.tests_run, ["unit"]);
});

test("recovery retries a dead running task", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.heartbeat_timeout_ms = 800;
  config.agent_command = "node -e \"setTimeout(()=>process.exit(0), 10000)\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);

  const runProcess = spawn(process.execPath, [CLI_PATH, "run", "--once"], {
    cwd: repoDir,
    env: {
      ...process.env,
      SHELL: "/bin/sh",
    },
    detached: false,
    stdio: "ignore",
  });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const pidRecord = JSON.parse(await readFile(path.join(repoDir, "runtime", "pids", "backend-auth.json"), "utf8"));
  process.kill(pidRecord.pid, "SIGKILL");
  runProcess.kill("SIGKILL");

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await runCli(["run", "--once"], repoDir);

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.ok(["todo", "claimed", "running", "review"].includes(task.status));
  assert.equal(task.retries, 1);
  assert.equal(task.metadata.execution.last_failure_kind, "stale_agent");
});

test("failed execution persists contract failure state", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"process.exit(7)\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);
  await runCli(["run", "--once"], repoDir);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "retry_wait");
  assert.equal(task.metadata.execution.last_failure_kind, "agent_exit");
  assert.equal(task.metadata.execution.last_status, "failed");
  assert.match(task.metadata.execution.last_error, /agent command failed with code 7/);

  const runtimeRecord = JSON.parse(await readFile(path.join(repoDir, "runtime", "executions", "backend-auth.json"), "utf8"));
  const taskContext = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "tasks", "backend-auth.json"), "utf8"));
  const handoff = JSON.parse(await readFile(path.join(repoDir, ".admiral", "context", "handoffs", "backend-auth.json"), "utf8"));
  assert.equal(runtimeRecord.result.status, "failed");
  assert.match(runtimeRecord.result.error, /agent command failed with code 7/);
  assert.equal(taskContext.execution.last_status, "failed");
  assert.match(handoff.latest.blockers[0], /agent command failed with code 7/);
});

test("invalid structured result fails without scheduling retry", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"const fs=require('node:fs');fs.writeFileSync(process.env.ADMIRAL_RESULT_FILE, JSON.stringify({status:'succeeded',changed_files:'src/backend/auth.js'}, null, 2));\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);
  await runCli(["run", "--once"], repoDir);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "failed");
  assert.equal(task.retries, 1);
  assert.equal(task.metadata.execution.last_failure_kind, "contract_invalid");
  assert.match(task.metadata.execution.last_error, /invalid task result field "changed_files"/);
});

test("structured blocked result moves task to blocked without treating command as failed", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"const fs=require('node:fs');fs.writeFileSync(process.env.ADMIRAL_RESULT_FILE, JSON.stringify({status:'blocked',summary:'Waiting on API key',blockers:['missing API key'],next_actions:['provision credential'],next_task_status:'blocked'}, null, 2));\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);
  await runCli(["run", "--once"], repoDir);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "blocked");
  assert.equal(task.metadata.execution.last_status, "blocked");
  assert.equal(task.metadata.execution.last_summary, "Waiting on API key");

  const result = JSON.parse(await readFile(path.join(task.workspace, ".admiral", "task-result.json"), "utf8"));
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["missing API key"]);
});

test("blocked task can be unblocked back to todo", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"const fs=require('node:fs');fs.writeFileSync(process.env.ADMIRAL_RESULT_FILE, JSON.stringify({status:'blocked',summary:'Waiting on API key',blockers:['missing API key'],next_actions:['provision credential'],next_task_status:'blocked'}, null, 2));\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);
  await runCli(["run", "--once"], repoDir);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await runCli(["task", "unblock", "backend-auth"], repoDir);

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "todo");
  assert.deepEqual(task.metadata.execution.last_blockers, []);
});

test("review task can be manually marked done", async () => {
  const repoDir = await createTempRepo();
  await runCli(["init"], repoDir);

  const configPath = path.join(repoDir, ".admiral", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.agent_command = "node -e \"const fs=require('node:fs');fs.writeFileSync(process.env.ADMIRAL_RESULT_FILE, JSON.stringify({status:'succeeded',summary:'Ready for review',next_task_status:'review'}, null, 2));\"";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await runCli(["task", "create", "backend-auth"], repoDir);
  await runCli(["run", "--once"], repoDir);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await runCli(["task", "done", "backend-auth"], repoDir);

  const graph = JSON.parse(await readFile(path.join(repoDir, "kanban", "graph.json"), "utf8"));
  const task = graph.tasks.find((item) => item.id === "backend-auth");
  assert.equal(task.status, "done");
});
