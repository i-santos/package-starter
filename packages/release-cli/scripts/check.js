#!/usr/bin/env node

const { spawnSync } = require('child_process');

const result = spawnSync('node', ['bin/release-cli.js', '--help'], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('release-cli check ok');
