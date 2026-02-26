#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const templateDir = path.join(rootDir, 'templates', 'npm-package');

function parseArgs(argv) {
  const args = { dir: 'examples' };
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
  }
  return args;
}

function validateName(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(name);
}

function copyDirRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!validateName(args.name)) {
    console.error('Erro: informe um nome válido com --name (ex: hello-package).');
    process.exit(1);
  }

  if (!fs.existsSync(templateDir)) {
    console.error(`Erro: template não encontrado em ${templateDir}`);
    process.exit(1);
  }

  const baseOutputDir = path.join(rootDir, args.dir);
  const targetDir = path.join(baseOutputDir, args.name);

  if (fs.existsSync(targetDir)) {
    console.error(`Erro: diretório já existe: ${targetDir}`);
    process.exit(1);
  }

  copyDirRecursive(templateDir, targetDir);

  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = args.name;
  const releaseCliDir = path.join(rootDir, 'packages', 'release-cli');
  const relativeReleaseCliPath = path.relative(targetDir, releaseCliDir).split(path.sep).join('/');
  packageJson.devDependencies = packageJson.devDependencies || {};
  packageJson.devDependencies['release-cli'] = `file:${relativeReleaseCliPath}`;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const readmePath = path.join(targetDir, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8').replace(/__PACKAGE_NAME__/g, args.name);
  fs.writeFileSync(readmePath, readme);

  console.log(`Pacote criado em ${targetDir}`);
}

main();
