"use strict";

const { mkdir, readFile, writeFile, readdir, rm, appendFile, access } = require("node:fs/promises");
const path = require("node:path");

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const content = typeof data === "undefined" ? "" : `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(filePath, content, "utf8");
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirSafe(dirPath) {
  try {
    return await readdir(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function removeFileIfExists(filePath) {
  await rm(filePath, { force: true });
}

async function appendText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, content, "utf8");
}

module.exports = {
  ensureDir,
  writeJson,
  readJson,
  readJsonIfExists,
  pathExists,
  readDirSafe,
  removeFileIfExists,
  appendText,
};
