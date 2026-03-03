#!/usr/bin/env node

const { spawnSync } = require('child_process');

const result = spawnSync('node', ['bin/ship.js', '--help'], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('ship check ok');
