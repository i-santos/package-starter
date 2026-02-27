const fs = require('fs');
const path = require('path');

function usage() {
  return [
    'Uso:',
    '  create-package-starter --name <nome> [--out <diretorio>]',
    '  create-package-starter init [--dir <diretorio>] [--force]',
    '',
    'Exemplo:',
    '  create-package-starter --name hello-package',
    '  create-package-starter --name @i-santos/swarm --out ./packages',
    '  create-package-starter init --dir ./meu-pacote',
    '  create-package-starter init --force'
  ].join('\n');
}

function parseCreateArgs(argv) {
  const args = {
    out: process.cwd()
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--name') {
      args.name = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--out') {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Argumento inválido: ${token}\n\n${usage()}`);
  }

  return args;
}

function parseInitArgs(argv) {
  const args = {
    dir: process.cwd(),
    force: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--force') {
      args.force = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Argumento inválido: ${token}\n\n${usage()}`);
  }

  return args;
}

function parseArgs(argv) {
  if (argv[0] === 'init') {
    return {
      mode: 'init',
      args: parseInitArgs(argv.slice(1))
    };
  }

  return {
    mode: 'create',
    args: parseCreateArgs(argv)
  };
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

function renderTemplateFile(filePath, variables) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = source.replace(/__PACKAGE_NAME__/g, variables.packageName);

  fs.writeFileSync(filePath, output);
}

function readJsonFile(filePath) {
  let raw;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Erro ao ler ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Erro ao parsear JSON em ${filePath}: ${error.message}`);
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureFileFromTemplate(targetPath, templatePath, options) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Erro: template não encontrado em ${templatePath}`);
  }

  const exists = fs.existsSync(targetPath);

  if (exists && !options.force) {
    return 'skipped';
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(templatePath, targetPath);

  if (exists) {
    return 'overwritten';
  }

  return 'created';
}

function configureExistingPackage(packageDir, templateDir, force) {
  if (!fs.existsSync(packageDir)) {
    throw new Error(`Erro: diretório não encontrado: ${packageDir}`);
  }

  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Erro: package.json não encontrado em ${packageDir}.`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  packageJson.scripts = packageJson.scripts || {};
  packageJson.devDependencies = packageJson.devDependencies || {};

  const desiredScripts = {
    changeset: 'changeset',
    'version-packages': 'changeset version',
    release: 'npm run check && changeset publish'
  };

  const summary = {
    createdFiles: [],
    overwrittenFiles: [],
    skippedFiles: [],
    updatedScriptKeys: [],
    skippedScriptKeys: [],
    updatedDependencyKeys: [],
    skippedDependencyKeys: []
  };

  let packageJsonChanged = false;

  for (const [key, value] of Object.entries(desiredScripts)) {
    const exists = Object.prototype.hasOwnProperty.call(packageJson.scripts, key);

    if (!exists || force) {
      if (!exists || packageJson.scripts[key] !== value) {
        packageJson.scripts[key] = value;
        packageJsonChanged = true;
      }
      summary.updatedScriptKeys.push(key);
      continue;
    }

    summary.skippedScriptKeys.push(key);
  }

  const dependencyKey = '@changesets/cli';
  const dependencyValue = '^2.29.7';
  const depExists = Object.prototype.hasOwnProperty.call(packageJson.devDependencies, dependencyKey);

  if (!depExists || force) {
    if (!depExists || packageJson.devDependencies[dependencyKey] !== dependencyValue) {
      packageJson.devDependencies[dependencyKey] = dependencyValue;
      packageJsonChanged = true;
    }
    summary.updatedDependencyKeys.push(dependencyKey);
  } else {
    summary.skippedDependencyKeys.push(dependencyKey);
  }

  if (packageJsonChanged) {
    writeJsonFile(packageJsonPath, packageJson);
  }

  const fileSpecs = [
    ['.changeset/config.json', '.changeset/config.json'],
    ['.changeset/README.md', '.changeset/README.md'],
    ['.github/workflows/release.yml', '.github/workflows/release.yml']
  ];

  for (const [targetRelativePath, templateRelativePath] of fileSpecs) {
    const targetPath = path.join(packageDir, targetRelativePath);
    const templatePath = path.join(templateDir, templateRelativePath);
    const result = ensureFileFromTemplate(targetPath, templatePath, { force });

    if (result === 'created') {
      summary.createdFiles.push(targetRelativePath);
    } else if (result === 'overwritten') {
      summary.overwrittenFiles.push(targetRelativePath);
    } else {
      summary.skippedFiles.push(targetRelativePath);
    }
  }

  if (!packageJson.scripts.check) {
    console.warn('Aviso: script "check" não encontrado. O script "release" executa "npm run check".');
  }

  console.log(`Projeto inicializado em ${packageDir}`);
  console.log(`Arquivos criados: ${summary.createdFiles.length ? summary.createdFiles.join(', ') : 'nenhum'}`);
  console.log(`Arquivos sobrescritos: ${summary.overwrittenFiles.length ? summary.overwrittenFiles.join(', ') : 'nenhum'}`);
  console.log(`Arquivos ignorados: ${summary.skippedFiles.length ? summary.skippedFiles.join(', ') : 'nenhum'}`);
  console.log(`Scripts atualizados: ${summary.updatedScriptKeys.length ? summary.updatedScriptKeys.join(', ') : 'nenhum'}`);
  console.log(`Scripts preservados: ${summary.skippedScriptKeys.length ? summary.skippedScriptKeys.join(', ') : 'nenhum'}`);
  console.log(`Dependências atualizadas: ${summary.updatedDependencyKeys.length ? summary.updatedDependencyKeys.join(', ') : 'nenhum'}`);
  console.log(`Dependências preservadas: ${summary.skippedDependencyKeys.length ? summary.skippedDependencyKeys.join(', ') : 'nenhum'}`);
}

function createNewPackage(args) {
  if (!validateName(args.name)) {
    throw new Error('Erro: informe um nome válido com --name (ex: hello-package ou @i-santos/swarm).');
  }

  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Erro: template não encontrado em ${templateDir}`);
  }

  const outputDir = path.resolve(args.out);
  const targetDir = path.join(outputDir, packageDirFromName(args.name));

  if (fs.existsSync(targetDir)) {
    throw new Error(`Erro: diretório já existe: ${targetDir}`);
  }

  copyDirRecursive(templateDir, targetDir);

  renderTemplateFile(path.join(targetDir, 'package.json'), {
    packageName: args.name
  });

  renderTemplateFile(path.join(targetDir, 'README.md'), {
    packageName: args.name
  });

  console.log(`Pacote criado em ${targetDir}`);
}

function initExistingPackage(args) {
  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const targetDir = path.resolve(args.dir);

  configureExistingPackage(targetDir, templateDir, args.force);
}

async function run(argv) {
  const parsed = parseArgs(argv);

  if (parsed.args.help) {
    console.log(usage());
    return;
  }

  if (parsed.mode === 'init') {
    initExistingPackage(parsed.args);
    return;
  }

  createNewPackage(parsed.args);
}

module.exports = { run };
