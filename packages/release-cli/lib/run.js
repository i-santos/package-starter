const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REGISTRY = 'http://127.0.0.1:4873';

function usage() {
  return [
    'Uso:',
    '  release-cli beta',
    '  release-cli stable',
    '  release-cli registry [url]',
    '',
    `Registry padrão: ${DEFAULT_REGISTRY}`
  ].join('\n');
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    const details = options.capture
      ? (result.stderr || result.stdout || '').trim()
      : '';
    const suffix = details ? `\n${details}` : '';
    throw new Error(`Falha ao executar: ${command} ${args.join(' ')}${suffix}`);
  }

  return (result.stdout || '').trim();
}

function findPackageDir(startDir) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, 'package.json');
    if (fs.existsSync(candidate)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('package.json não encontrado. Execute o comando dentro de um pacote npm.');
    }

    currentDir = parentDir;
  }
}

function readPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(content);
}

function ensureGitClean() {
  try {
    runCommand('git', ['rev-parse', '--is-inside-work-tree'], { capture: true });
  } catch (_error) {
    throw new Error('Este comando exige um repositório git válido.');
  }

  const status = runCommand('git', ['status', '--porcelain'], { capture: true });
  if (status) {
    throw new Error('Git não está limpo. Faça commit/stash antes do release.');
  }
}

function releaseBeta(packageDir) {
  ensureGitClean();

  runCommand(
    'npm',
    ['version', 'prerelease', '--preid', 'beta', '--no-git-tag-version'],
    { cwd: packageDir }
  );
  const version = readPackageJson(packageDir).version;

  runCommand('git', ['add', '-A']);
  runCommand('git', ['commit', '-m', `chore(release): v${version}`]);

  try {
    runCommand('npm', ['publish', '--tag', 'beta'], { cwd: packageDir });
  } catch (error) {
    throw new Error(`Publicação beta falhou. Verifique auth/registry.\n${error.message}`);
  }

  console.log(`Release beta concluído: v${version}`);
}

function releaseStable(packageDir) {
  ensureGitClean();

  const pkg = readPackageJson(packageDir);
  const betaMatch = String(pkg.version || '').match(/^(\d+\.\d+\.\d+)-beta\.\d+$/);

  if (betaMatch) {
    runCommand('npm', ['version', betaMatch[1], '--no-git-tag-version'], { cwd: packageDir });
  } else {
    runCommand('npm', ['version', 'patch', '--no-git-tag-version'], { cwd: packageDir });
  }
  const version = readPackageJson(packageDir).version;

  runCommand('git', ['add', '-A']);
  runCommand('git', ['commit', '-m', `chore(release): v${version}`]);

  try {
    runCommand('npm', ['publish'], { cwd: packageDir });
  } catch (error) {
    throw new Error(`Publicação stable falhou. Verifique auth/registry.\n${error.message}`);
  }

  console.log(`Release stable concluído: v${version}`);
}

function setRegistry(packageDir, registryUrl) {
  const npmrcPath = path.join(packageDir, '.npmrc');
  const content = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : '';
  const lines = content ? content.split(/\r?\n/) : [];

  let replaced = false;
  const nextLines = [];

  for (const line of lines) {
    if (line.startsWith('registry=')) {
      if (!replaced) {
        nextLines.push(`registry=${registryUrl}`);
        replaced = true;
      }
      continue;
    }

    if (line !== '') {
      nextLines.push(line);
    }
  }

  if (!replaced) {
    nextLines.push(`registry=${registryUrl}`);
  }

  fs.writeFileSync(npmrcPath, `${nextLines.join('\n')}\n`);
  console.log(`.npmrc atualizado: registry=${registryUrl}`);
}

async function run(argv) {
  const [command, maybeValue] = argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  const packageDir = findPackageDir(process.cwd());

  if (command === 'beta') {
    releaseBeta(packageDir);
    return;
  }

  if (command === 'stable') {
    releaseStable(packageDir);
    return;
  }

  if (command === 'registry') {
    setRegistry(packageDir, maybeValue || DEFAULT_REGISTRY);
    return;
  }

  throw new Error(`Comando inválido: ${command}\n\n${usage()}`);
}

module.exports = {
  run
};
