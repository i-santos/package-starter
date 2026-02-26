const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REGISTRY = 'http://127.0.0.1:4873';

function usage() {
  return [
    'Uso:',
    '  release-cli beta',
    '  release-cli stable',
    '  release-cli publish [tag]',
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

function readRegistryFromNpmrc(packageDir) {
  const npmrcPath = path.join(packageDir, '.npmrc');
  if (!fs.existsSync(npmrcPath)) {
    return null;
  }

  const content = fs.readFileSync(npmrcPath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.startsWith('registry='));
  if (!line) {
    return null;
  }

  return line.slice('registry='.length).trim() || null;
}

function ensureGitClean() {
  let gitRoot;

  try {
    gitRoot = runCommand('git', ['rev-parse', '--show-toplevel'], { capture: true });
  } catch (_error) {
    throw new Error('Este comando exige um repositório git válido.');
  }

  const status = runCommand('git', ['status', '--porcelain'], { capture: true, cwd: gitRoot });
  if (status) {
    throw new Error('Git não está limpo. Faça commit/stash antes do release.');
  }

  return gitRoot;
}

function listGitChanges(gitRoot) {
  const unstaged = runCommand('git', ['diff', '--name-only'], { capture: true, cwd: gitRoot });
  const staged = runCommand('git', ['diff', '--cached', '--name-only'], { capture: true, cwd: gitRoot });
  const names = new Set();

  for (const value of [unstaged, staged]) {
    if (!value) {
      continue;
    }

    for (const line of value.split(/\r?\n/)) {
      if (line) {
        names.add(line);
      }
    }
  }

  return Array.from(names);
}

function rollbackPaths(gitRoot, paths) {
  if (!paths.length) {
    return;
  }

  runCommand('git', ['restore', '--staged', '--worktree', '--', ...paths], { cwd: gitRoot });
}

function publishPackage(packageDir, options = {}) {
  const registry = readRegistryFromNpmrc(packageDir);
  const publishArgs = ['publish'];

  if (options.tag) {
    publishArgs.push('--tag', options.tag);
  }

  if (registry) {
    publishArgs.push('--registry', registry);
  }

  runCommand('npm', publishArgs, { cwd: packageDir });
}

function releaseBeta(packageDir) {
  const gitRoot = ensureGitClean();

  runCommand(
    'npm',
    ['version', 'prerelease', '--preid', 'beta', '--no-git-tag-version'],
    { cwd: packageDir }
  );
  const version = readPackageJson(packageDir).version;
  const changedPaths = listGitChanges(gitRoot);

  try {
    publishPackage(packageDir, { tag: 'beta' });
  } catch (error) {
    try {
      rollbackPaths(gitRoot, changedPaths);
    } catch (rollbackError) {
      throw new Error(
        `Publicação beta falhou e rollback também falhou.\n${error.message}\nRollback: ${rollbackError.message}`
      );
    }

    throw new Error(
      `Publicação beta falhou. Rollback aplicado (sem commit de release).\n${error.message}`
    );
  }

  if (!changedPaths.length) {
    throw new Error('Nenhuma alteração detectada após bump de versão.');
  }

  runCommand('git', ['add', '--', ...changedPaths], { cwd: gitRoot });
  runCommand('git', ['commit', '-m', `chore(release): v${version}`], { cwd: gitRoot });
  console.log(`Release beta concluído: v${version}`);
}

function releaseStable(packageDir) {
  const gitRoot = ensureGitClean();

  const pkg = readPackageJson(packageDir);
  const betaMatch = String(pkg.version || '').match(/^(\d+\.\d+\.\d+)-beta\.\d+$/);

  if (betaMatch) {
    runCommand('npm', ['version', betaMatch[1], '--no-git-tag-version'], { cwd: packageDir });
  } else {
    runCommand('npm', ['version', 'patch', '--no-git-tag-version'], { cwd: packageDir });
  }
  const version = readPackageJson(packageDir).version;
  const changedPaths = listGitChanges(gitRoot);

  try {
    publishPackage(packageDir);
  } catch (error) {
    try {
      rollbackPaths(gitRoot, changedPaths);
    } catch (rollbackError) {
      throw new Error(
        `Publicação stable falhou e rollback também falhou.\n${error.message}\nRollback: ${rollbackError.message}`
      );
    }

    throw new Error(
      `Publicação stable falhou. Rollback aplicado (sem commit de release).\n${error.message}`
    );
  }

  if (!changedPaths.length) {
    throw new Error('Nenhuma alteração detectada após bump de versão.');
  }

  runCommand('git', ['add', '--', ...changedPaths], { cwd: gitRoot });
  runCommand('git', ['commit', '-m', `chore(release): v${version}`], { cwd: gitRoot });
  console.log(`Release stable concluído: v${version}`);
}

function releasePublish(packageDir, tag) {
  try {
    publishPackage(packageDir, { tag });
  } catch (error) {
    throw new Error(`Publicação falhou. Verifique auth/registry.\n${error.message}`);
  }

  if (tag) {
    console.log(`Publish concluído com tag "${tag}".`);
    return;
  }

  console.log('Publish concluído.');
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

  if (command === 'publish') {
    releasePublish(packageDir, maybeValue);
    return;
  }

  throw new Error(`Comando inválido: ${command}\n\n${usage()}`);
}

module.exports = {
  run
};
