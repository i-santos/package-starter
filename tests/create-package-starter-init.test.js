const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run: runCli } = require('../packages/create-package-starter/lib/run');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createExecStub(handlers = []) {
  const calls = [];

  function exec(command, args, options = {}) {
    calls.push({ command, args, options });

    for (const handler of handlers) {
      const maybe = handler(command, args, options);
      if (maybe) {
        return {
          status: maybe.status ?? 0,
          stdout: maybe.stdout ?? '',
          stderr: maybe.stderr ?? ''
        };
      }
    }

    return { status: 0, stdout: '', stderr: '' };
  }

  return { exec, calls };
}

test('init bootstraps missing standards files, scripts and dependency in existing package', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-existing-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'existing-package',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2) + '\n');

  const stub = createExecStub();
  await runCli(['init', '--dir', workDir], { exec: stub.exec });

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
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'ci.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'auto-retarget-pr.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'promote-stable.yml')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'PULL_REQUEST_TEMPLATE.md')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'CODEOWNERS')), true);
  assert.equal(fs.existsSync(path.join(workDir, 'CONTRIBUTING.md')), true);

  const installCall = stub.calls.find((call) => call.command === 'npm' && call.args[0] === 'install');
  assert.ok(installCall, 'expected npm install at end of init');
});

test('init preserves existing config by default (safe merge)', async () => {
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
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Existing\n');
  fs.writeFileSync(path.join(workDir, 'CONTRIBUTING.md'), 'Existing contributing\n');

  await runCli(['init', '--dir', workDir], { exec: createExecStub().exec });

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
  assert.equal(fs.readFileSync(path.join(workDir, 'README.md'), 'utf8'), '# Existing\n');
  assert.equal(fs.readFileSync(path.join(workDir, 'CONTRIBUTING.md'), 'utf8'), 'Existing contributing\n');
});

test('init --force overwrites managed scripts and dependency version but keeps README/CONTRIBUTING', async () => {
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
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Corporate README\n');
  fs.writeFileSync(path.join(workDir, 'CONTRIBUTING.md'), 'Corporate contributing\n');

  await runCli(['init', '--dir', workDir, '--force'], { exec: createExecStub().exec });

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
  assert.equal(fs.readFileSync(path.join(workDir, 'README.md'), 'utf8'), '# Corporate README\n');
  assert.equal(fs.readFileSync(path.join(workDir, 'CONTRIBUTING.md'), 'utf8'), 'Corporate contributing\n');
});

test('init appends missing template entries to existing .gitignore', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-gitignore-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'gitignore-package',
    version: '1.0.0'
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(workDir, '.gitignore'), 'custom-file\nnode_modules/\n');

  await runCli(['init', '--dir', workDir], { exec: createExecStub().exec });

  const gitignore = fs.readFileSync(path.join(workDir, '.gitignore'), 'utf8');
  assert.match(gitignore, /custom-file/);
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /dist\//);
  assert.match(gitignore, /\.env/);
});

test('init --cleanup-legacy-release removes legacy release scripts only when requested', async () => {
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

  await runCli(['init', '--dir', workDir], { exec: createExecStub().exec });

  const firstPkg = readJson(path.join(workDir, 'package.json'));
  assert.equal(firstPkg.scripts['release:beta'], 'echo beta');
  assert.equal(firstPkg.scripts['release:dist-tags'], 'echo tags');

  await runCli(['init', '--dir', workDir, '--cleanup-legacy-release'], { exec: createExecStub().exec });

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
    () => runCli(['init', '--dir', workDir], { exec: createExecStub().exec }),
    /package\.json not found/
  );
});
