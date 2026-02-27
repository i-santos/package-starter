#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const templateDir = path.join(rootDir, 'templates', 'npm-package');

function parseArgs(argv) {
  const args = { dir: 'examples', defaultBranch: 'main' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--name') {
      args.name = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--dir') {
      args.dir = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--default-branch') {
      args.defaultBranch = argv[i + 1] || 'main';
      i += 1;
      continue;
    }
  }
  return args;
}

function validateName(name) {
  if (typeof name !== 'string') {
    return false;
  }

  const plain = /^[a-z0-9][a-z0-9._-]*$/;
  const scoped = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
  return plain.test(name) || scoped.test(name);
}

function packageDirFromName(packageName) {
  const parts = packageName.split('/');
  return parts[parts.length - 1];
}

function deriveScope(packageName) {
  if (!packageName.startsWith('@')) {
    return 'team';
  }

  return packageName.slice(1).split('/')[0];
}

function renderTemplateString(source, variables) {
  let output = source;

  for (const [key, value] of Object.entries(variables)) {
    output = output.replace(new RegExp(`__${key}__`, 'g'), value);
  }

  return output;
}

function copyDirRecursive(sourceDir, targetDir, variables) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, variables);
      continue;
    }

    const source = fs.readFileSync(srcPath, 'utf8');
    const rendered = renderTemplateString(source, variables);
    fs.writeFileSync(destPath, rendered);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!validateName(args.name)) {
    console.error('Erro: informe um nome válido com --name (ex: hello-package ou @i-santos/swarm).');
    process.exit(1);
  }

  if (!fs.existsSync(templateDir)) {
    console.error(`Erro: template não encontrado em ${templateDir}`);
    process.exit(1);
  }

  const baseOutputDir = path.join(rootDir, args.dir);
  const targetDir = path.join(baseOutputDir, packageDirFromName(args.name));

  if (fs.existsSync(targetDir)) {
    console.error(`Erro: diretório já existe: ${targetDir}`);
    process.exit(1);
  }

  copyDirRecursive(templateDir, targetDir, {
    PACKAGE_NAME: args.name,
    DEFAULT_BRANCH: args.defaultBranch,
    BETA_BRANCH: 'release/beta',
    SCOPE: deriveScope(args.name)
  });

  console.log(`Pacote criado em ${targetDir}`);
}

main();
