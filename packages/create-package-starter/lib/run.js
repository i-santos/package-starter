const fs = require('fs');
const path = require('path');

function usage() {
  return [
    'Uso:',
    '  create-package-starter --name <nome> [--out <diretorio>]',
    '',
    'Exemplo:',
    '  create-package-starter --name hello-package',
    '  create-package-starter --name @i-santos/swarm',
    '  create-package-starter --name hello-package --out ./packages'
  ].join('\n');
}

function parseArgs(argv) {
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

async function run(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(usage());
    return;
  }

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

module.exports = { run };
