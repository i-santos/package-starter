const fs = require('fs');
const path = require('path');

const DEFAULT_RELEASE_CLI_PKG = '@i-santos/release-cli';
const DEFAULT_RELEASE_CLI_VERSION = '^0.1.0';

function usage() {
  return [
    'Uso:',
    '  create-package-starter --name <nome> [--out <diretorio>] [--release-cli-pkg <pkg>] [--release-cli-version <versao>]',
    '',
    'Exemplo:',
    '  create-package-starter --name hello-package',
    '  create-package-starter --name @i-santos/swarm',
    '  create-package-starter --name hello-package --out ./packages',
    '  create-package-starter --name hello-package --release-cli-pkg @i-santos/release-cli --release-cli-version ^1.0.0'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    out: process.cwd(),
    releaseCliPkg: DEFAULT_RELEASE_CLI_PKG,
    releaseCliVersion: DEFAULT_RELEASE_CLI_VERSION
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

    if (token === '--release-cli-pkg') {
      args.releaseCliPkg = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === '--release-cli-version') {
      args.releaseCliVersion = argv[i + 1];
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
  const output = source
    .replace(/__PACKAGE_NAME__/g, variables.packageName)
    .replace(/__RELEASE_CLI_PKG__/g, variables.releaseCliPkg)
    .replace(/__RELEASE_CLI_VERSION__/g, variables.releaseCliVersion);

  fs.writeFileSync(filePath, output);
}

async function run(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!validateName(args.name)) {
    throw new Error('Erro: informe um nome válido com --name (ex: hello-package ou @i-santos/swarm).');
  }

  if (!args.releaseCliPkg || !args.releaseCliVersion) {
    throw new Error('Erro: --release-cli-pkg e --release-cli-version devem ser informados corretamente.');
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
    packageName: args.name,
    releaseCliPkg: args.releaseCliPkg,
    releaseCliVersion: args.releaseCliVersion
  });

  renderTemplateFile(path.join(targetDir, 'README.md'), {
    packageName: args.name,
    releaseCliPkg: args.releaseCliPkg,
    releaseCliVersion: args.releaseCliVersion
  });

  console.log(`Pacote criado em ${targetDir}`);
}

module.exports = { run };
