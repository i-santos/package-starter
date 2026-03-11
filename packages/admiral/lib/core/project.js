"use strict";

const path = require("node:path");
const { readJson, writeJson, readDirSafe, readJsonIfExists } = require("../utils/fs");
const { getRepoRoot } = require("../utils/git");
const { emptyBoard } = require("./state");
const { withLock } = require("./locks");

function buildPaths(root) {
  return {
    config: path.join(root, ".admiral", "config.json"),
    graph: path.join(root, "kanban", "graph.json"),
    board: path.join(root, "kanban", "board.json"),
    eventsLog: path.join(root, "events", "events.log"),
    workspacesDir: path.join(root, "workspaces"),
    logsDir: path.join(root, "logs"),
    agentLogsDir: path.join(root, "logs", "agents"),
    runtimeDir: path.join(root, "runtime"),
    runtimeHeartbeatsDir: path.join(root, "runtime", "heartbeats"),
    runtimePidsDir: path.join(root, "runtime", "pids"),
    locksDir: path.join(root, ".admiral", "locks"),
    graphLock: path.join(root, ".admiral", "locks", "graph.lock"),
  };
}

async function loadProject(cwd) {
  const root = await getRepoRoot(cwd);
  const paths = buildPaths(root);
  const [config, graph, board] = await Promise.all([
    readJson(paths.config),
    readJson(paths.graph),
    readJsonIfExists(paths.board, emptyBoard()),
  ]);

  return {
    root,
    paths,
    config,
    graph,
    board,
  };
}

async function reloadGraph(project) {
  project.graph = await readJson(project.paths.graph);
  return project.graph;
}

async function withGraphMutation(project, mutateFn) {
  return withLock(project.paths.graphLock, async () => {
    const graph = await readJson(project.paths.graph);
    const nextGraph = await mutateFn(graph);
    await writeJson(project.paths.graph, nextGraph);
    project.graph = nextGraph;
    return nextGraph;
  });
}

async function readHeartbeats(project) {
  const entries = await readDirSafe(project.paths.runtimeHeartbeatsDir);
  const items = await Promise.all(entries.map((entry) => readJsonIfExists(path.join(project.paths.runtimeHeartbeatsDir, entry), null)));
  return items.filter(Boolean);
}

async function readPidRecords(project) {
  const entries = await readDirSafe(project.paths.runtimePidsDir);
  const items = await Promise.all(entries.map((entry) => readJsonIfExists(path.join(project.paths.runtimePidsDir, entry), null)));
  return items.filter(Boolean);
}

async function saveBoard(project) {
  const board = emptyBoard();
  board.updated_at = new Date().toISOString();
  for (const task of project.graph.tasks) {
    if (!board.columns[task.status]) {
      board.columns[task.status] = [];
    }
    board.columns[task.status].push(task.id);
    if (task.agent && ["claimed", "running"].includes(task.status)) {
      board.active_agents.push({
        task: task.id,
        agent: task.agent,
      });
    }
  }
  await writeJson(project.paths.board, board);
  project.board = board;
}

module.exports = {
  buildPaths,
  loadProject,
  reloadGraph,
  withGraphMutation,
  readHeartbeats,
  readPidRecords,
  saveBoard,
};
