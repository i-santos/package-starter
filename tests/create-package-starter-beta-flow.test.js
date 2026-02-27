const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../packages/create-package-starter/lib/run');

function createExecStub(handlers) {
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

function createPackageDir() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-flow-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: '@i-santos/beta-package',
    version: '1.0.0',
    scripts: {
      check: 'node -e "process.exit(0)"',
      release: 'npm run check && changeset publish'
    }
  }, null, 2));
  return workDir;
}

test('setup-beta creates release-beta workflow and scripts', async () => {
  const workDir = createPackageDir();

  await run(['setup-beta', '--dir', workDir, '--beta-branch', 'release/beta']);

  const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');

  const workflowPath = path.join(workDir, '.github', 'workflows', 'release-beta.yml');
  assert.equal(fs.existsSync(workflowPath), true);

  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /- release\/beta/);
  assert.match(workflow, /beta:publish/);
});

test('setup-beta dry-run does not mutate files', async () => {
  const workDir = createPackageDir();
  const packageJsonBefore = fs.readFileSync(path.join(workDir, 'package.json'), 'utf8');

  await run(['setup-beta', '--dir', workDir, '--dry-run']);

  const packageJsonAfter = fs.readFileSync(path.join(workDir, 'package.json'), 'utf8');
  assert.equal(packageJsonAfter, packageJsonBefore);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release-beta.yml')), false);
});

test('promote-stable exits pre mode and creates promotion changeset', async () => {
  const workDir = createPackageDir();
  fs.mkdirSync(path.join(workDir, '.changeset'), { recursive: true });
  fs.writeFileSync(path.join(workDir, '.changeset', 'pre.json'), JSON.stringify({ mode: 'pre', tag: 'beta' }, null, 2));

  const stub = createExecStub([
    (command, args) => {
      if (command === 'npx' && args[0] === '@changesets/cli' && args[1] === 'pre' && args[2] === 'exit') {
        return { status: 0, stdout: 'ok' };
      }
      return null;
    }
  ]);

  await run(['promote-stable', '--dir', workDir, '--type', 'minor', '--summary', 'Promote beta to stable'], {
    exec: stub.exec
  });

  const call = stub.calls.find((entry) => entry.command === 'npx' && entry.args[0] === '@changesets/cli');
  assert.ok(call, 'expected npx changeset pre exit call');

  const changesetFiles = fs.readdirSync(path.join(workDir, '.changeset')).filter((name) => name.startsWith('promote-stable-'));
  assert.equal(changesetFiles.length, 1);

  const changesetContent = fs.readFileSync(path.join(workDir, '.changeset', changesetFiles[0]), 'utf8');
  assert.match(changesetContent, /"@i-santos\/beta-package": minor/);
  assert.match(changesetContent, /Promote beta to stable/);
});

test('promote-stable fails when pre mode file is missing', async () => {
  const workDir = createPackageDir();

  await assert.rejects(
    () => run(['promote-stable', '--dir', workDir]),
    /No prerelease state found/
  );
});
