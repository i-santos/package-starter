const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run: runCli } = require('../packages/create-package-starter/lib/run');

const binPath = path.resolve(__dirname, '..', 'packages', 'create-package-starter', 'bin', 'create-package-starter.js');

function run(args) {
  return spawnSync('node', [binPath, ...args], {
    encoding: 'utf8'
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('init bootstraps missing changesets files, scripts and dependency in existing package', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-existing-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'existing-package',
    version: '1.0.0',
    scripts: {
      check: 'node -e "process.exit(0)"'
    }
  }, null, 2) + '\n');

  const result = run(['init', '--dir', workDir]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && changeset publish');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');

  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'config.json')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'README.md')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release.yml')), true);
});

test('init preserves existing config by default (safe merge)', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-safe-'));
  fs.mkdirSync(path.join(workDir, '.changeset'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '.github', 'workflows'), { recursive: true });

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'safe-merge-package',
    version: '1.0.0',
    scripts: {
      check: 'node -e "process.exit(0)"',
      changeset: 'custom changeset',
      release: 'custom release'
    },
    devDependencies: {
      '@changesets/cli': '^0.0.1'
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(workDir, '.changeset', 'config.json'), '{"custom":true}\n');
  fs.writeFileSync(path.join(workDir, '.changeset', 'README.md'), 'custom readme\n');
  fs.writeFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'name: Custom\n');

  const result = run(['init', '--dir', workDir]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.changeset, 'custom changeset');
  assert.equal(pkg.scripts.release, 'custom release');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^0.0.1');

  assert.equal(fs.readFileSync(path.join(workDir, '.changeset', 'config.json'), 'utf8'), '{"custom":true}\n');
  assert.equal(fs.readFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'utf8'), 'name: Custom\n');
});

test('init --force overwrites managed files and scripts', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-force-'));
  fs.mkdirSync(path.join(workDir, '.changeset'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '.github', 'workflows'), { recursive: true });

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'force-package',
    version: '1.0.0',
    scripts: {
      check: 'node -e "process.exit(0)"',
      changeset: 'custom changeset',
      release: 'custom release'
    },
    devDependencies: {
      '@changesets/cli': '^0.0.1'
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(workDir, '.changeset', 'config.json'), '{"custom":true}\n');
  fs.writeFileSync(path.join(workDir, '.changeset', 'README.md'), 'custom readme\n');
  fs.writeFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'name: Custom\n');

  const result = run(['init', '--dir', workDir, '--force']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && changeset publish');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');

  const workflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /name: Release/);
});

test('init fails with actionable error when package.json is missing', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-missing-pkg-'));

  await assert.rejects(
    () => runCli(['init', '--dir', workDir]),
    /package\.json não encontrado/
  );
});
