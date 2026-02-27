#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const requiredScripts = ['release:beta', 'release:stable', 'release:publish', 'registry:start'];
for (const scriptName of requiredScripts) {
  if (!pkg.scripts || !pkg.scripts[scriptName]) {
    console.error(`Script obrigatório ausente: ${scriptName}`);
    process.exit(1);
  }
}

console.log(`check ok para ${pkg.name}@${pkg.version}`);
