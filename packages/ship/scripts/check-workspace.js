#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function collectWorkspacePackageNames(subdir) {
  const dir = path.join(rootDir, subdir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .map((name) => path.join(dir, name, 'package.json'))
    .filter((packageJsonPath) => fs.existsSync(packageJsonPath))
    .map((packageJsonPath) => JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')))
    .filter((pkg) => pkg.scripts && pkg.scripts.check)
    .map((pkg) => pkg.name);
}

function main() {
  const packageNames = [
    ...collectWorkspacePackageNames('packages'),
    ...collectWorkspacePackageNames('examples')
  ];

  for (const packageName of packageNames) {
    run('npm', ['run', 'check', '-w', packageName]);
  }

  console.log('Workspace check finalizado.');
}

main();
