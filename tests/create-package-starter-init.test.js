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

test('init bootstraps missing standards files, scripts and dependency in existing package', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-existing-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'existing-package',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2) + '\n');

  const result = run(['init', '--dir', workDir]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.check, 'npm run test');
  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && changeset publish');
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:exit'], 'changeset pre exit');
  assert.equal(pkg.scripts['beta:version'], 'changeset version');
  assert.equal(pkg.scripts['beta:publish'], 'changeset publish');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');

  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'config.json')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'README.md')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release-beta.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'ci.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'PULL_REQUEST_TEMPLATE.md')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'CODEOWNERS')), true);
  assert.equal(fs.existsSync(path.join(workDir, 'CONTRIBUTING.md')), true);
});

test('init preserves existing config by default (safe merge)', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-safe-'));
  fs.mkdirSync(path.join(workDir, '.changeset'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '.github', 'workflows'), { recursive: true });

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'safe-merge-package',
    version: '1.0.0',
    scripts: {
      check: 'custom check',
      changeset: 'custom changeset',
      release: 'custom release'
    },
    devDependencies: {
      '@changesets/cli': '^0.0.1'
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(workDir, '.changeset', 'config.json'), '{"custom":true}\n');
  fs.writeFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'name: Custom\n');
  fs.writeFileSync(path.join(workDir, '.github', 'pull_request_template.md'), 'legacy lowercase\n');

  const result = run(['init', '--dir', workDir]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.check, 'custom check');
  assert.equal(pkg.scripts.changeset, 'custom changeset');
  assert.equal(pkg.scripts.release, 'custom release');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^0.0.1');

  assert.equal(fs.readFileSync(path.join(workDir, '.changeset', 'config.json'), 'utf8'), '{"custom":true}\n');
  assert.equal(fs.readFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'utf8'), 'name: Custom\n');
  assert.equal(fs.readFileSync(path.join(workDir, '.github', 'pull_request_template.md'), 'utf8'), 'legacy lowercase\n');
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'PULL_REQUEST_TEMPLATE.md')), false);
});

test('init --force overwrites managed files and scripts and dependency version', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-force-'));
  fs.mkdirSync(path.join(workDir, '.changeset'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '.github', 'workflows'), { recursive: true });

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'force-package',
    version: '1.0.0',
    scripts: {
      check: 'custom check',
      changeset: 'custom changeset',
      release: 'custom release'
    },
    devDependencies: {
      '@changesets/cli': '^0.0.1'
    }
  }, null, 2) + '\n');

  fs.writeFileSync(path.join(workDir, '.changeset', 'config.json'), '{"custom":true}\n');
  fs.writeFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'name: Custom\n');

  const result = run(['init', '--dir', workDir, '--force']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const pkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(pkg.scripts.check, 'npm run test');
  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && changeset publish');
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:exit'], 'changeset pre exit');
  assert.equal(pkg.scripts['beta:version'], 'changeset version');
  assert.equal(pkg.scripts['beta:publish'], 'changeset publish');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');

  const workflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /name: Release/);
});

test('init --cleanup-legacy-release removes legacy release scripts only when requested', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-cleanup-'));

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'cleanup-package',
    version: '1.0.0',
    scripts: {
      test: 'node --test',
      'release:beta': 'echo beta',
      'release:beta:next': 'echo beta next',
      'release:stable': 'echo stable',
      'release:promote:1': 'echo promote',
      'release:rollback': 'echo rollback',
      'release:dist-tags': 'echo tags'
    }
  }, null, 2) + '\n');

  const firstResult = run(['init', '--dir', workDir]);
  assert.equal(firstResult.status, 0, firstResult.stderr || firstResult.stdout);

  const firstPkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(firstPkg.scripts['release:beta'], 'echo beta');
  assert.equal(firstPkg.scripts['release:dist-tags'], 'echo tags');

  const secondResult = run(['init', '--dir', workDir, '--cleanup-legacy-release']);
  assert.equal(secondResult.status, 0, secondResult.stderr || secondResult.stdout);

  const secondPkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(secondPkg.scripts['release:beta'], undefined);
  assert.equal(secondPkg.scripts['release:beta:next'], undefined);
  assert.equal(secondPkg.scripts['release:stable'], undefined);
  assert.equal(secondPkg.scripts['release:promote:1'], undefined);
  assert.equal(secondPkg.scripts['release:rollback'], undefined);
  assert.equal(secondPkg.scripts['release:dist-tags'], undefined);
});

test('init fails with actionable error when package.json is missing', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-missing-pkg-'));

  await assert.rejects(
    () => runCli(['init', '--dir', workDir]),
    /package\.json not found/
  );
});
