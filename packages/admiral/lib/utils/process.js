"use strict";

const { execFile: nodeExecFile, exec: nodeExec, spawnSync } = require("node:child_process");

async function execFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    nodeExecFile(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      encoding: "utf8",
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const code = error && typeof error.code === "number" ? error.code : 0;
      if (error && !options.allowFailure) {
        reject(new Error(stderr || error.message || `${command} exited with code ${code}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function execShellCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    nodeExec(command, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      encoding: "utf8",
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      shell: process.env.SHELL || "/bin/sh",
    }, (error, stdout, stderr) => {
      const code = error && typeof error.code === "number" ? error.code : 0;
      if (error && !options.allowFailure) {
        reject(new Error(stderr || error.message || `command exited with code ${code}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }
  const result = spawnSync("kill", ["-0", String(pid)], {
    stdio: "ignore",
  });
  return result.status === 0;
}

module.exports = {
  execFile,
  execShellCommand,
  isProcessAlive,
};
