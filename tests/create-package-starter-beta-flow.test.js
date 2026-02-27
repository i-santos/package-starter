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

test('setup-beta updates release workflow and scripts plus github branch/ruleset', async () => {
  const workDir = createPackageDir();
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'PUT' && args[3] === '/repos/i-santos/firestack/actions/permissions/workflow') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/branches/release%2Fbeta') {
        return { status: 1, stderr: '404 Not Found' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/git/ref/heads/main') {
        return { status: 0, stdout: JSON.stringify({ object: { sha: 'abc123' } }) };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'POST' && args[3] === '/repos/i-santos/firestack/git/refs') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/rulesets') {
        return { status: 0, stdout: '[]' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'POST' && args[3] === '/repos/i-santos/firestack/rulesets') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    }
  ]);

  await run(['setup-beta', '--dir', workDir, '--repo', 'i-santos/firestack', '--beta-branch', 'release/beta', '--yes'], { exec: stub.exec });

  const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');

  const workflowPath = path.join(workDir, '.github', 'workflows', 'release.yml');
  assert.equal(fs.existsSync(workflowPath), true);
  const ciWorkflowPath = path.join(workDir, '.github', 'workflows', 'ci.yml');
  assert.equal(fs.existsSync(ciWorkflowPath), true);

  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /- main/);
  assert.match(workflow, /- release\/beta/);
  assert.match(workflow, /publish: npm run release/);
  const ciWorkflow = fs.readFileSync(ciWorkflowPath, 'utf8');
  assert.match(ciWorkflow, /- main/);
  assert.match(ciWorkflow, /- release\/beta/);

  const rulesetPostCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'POST' && call.args[3] === '/repos/i-santos/firestack/rulesets');
  assert.ok(rulesetPostCall, 'expected beta ruleset upsert');
  const rulesetPayload = JSON.parse(rulesetPostCall.options.input);
  assert.equal(rulesetPayload.rules.some((rule) => rule.type === 'required_status_checks'), true);
  const statusChecksRule = rulesetPayload.rules.find((rule) => rule.type === 'required_status_checks');
  const contexts = statusChecksRule.parameters.required_status_checks.map((item) => item.context);
  assert.equal(contexts.includes('CI / check (18) (pull_request)'), true);
  assert.equal(contexts.includes('CI / check (20) (pull_request)'), true);
});

test('setup-beta dry-run does not mutate files', async () => {
  const workDir = createPackageDir();
  const packageJsonBefore = fs.readFileSync(path.join(workDir, 'package.json'), 'utf8');
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null)
  ]);

  await run(['setup-beta', '--dir', workDir, '--repo', 'i-santos/firestack', '--dry-run', '--yes'], { exec: stub.exec });

  const packageJsonAfter = fs.readFileSync(path.join(workDir, 'package.json'), 'utf8');
  assert.equal(packageJsonAfter, packageJsonBefore);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release.yml')), false);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'ci.yml')), false);
});

test('setup-beta updates existing release workflow trigger when beta branch is missing', async () => {
  const workDir = createPackageDir();
  fs.mkdirSync(path.join(workDir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(workDir, '.github', 'workflows', 'release.yml'),
    [
      'name: Release',
      '',
      'on:',
      '  push:',
      '    branches:',
      '      - main',
      '',
      'permissions:',
      '  contents: write'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(workDir, '.github', 'workflows', 'ci.yml'),
    [
      'name: CI',
      '',
      'on:',
      '  pull_request:',
      '  push:',
      '    branches:',
      '      - main',
      '',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest'
    ].join('\n')
  );

  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'PUT' && args[3] === '/repos/i-santos/firestack/actions/permissions/workflow') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/branches/release%2Fbeta') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/rulesets') {
        return { status: 0, stdout: '[]' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'POST' && args[3] === '/repos/i-santos/firestack/rulesets') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    }
  ]);

  await run(['setup-beta', '--dir', workDir, '--repo', 'i-santos/firestack', '--beta-branch', 'release/beta', '--yes'], {
    exec: stub.exec
  });

  const workflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /- main/);
  assert.match(workflow, /- release\/beta/);
  const ciWorkflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ciWorkflow, /- main/);
  assert.match(ciWorkflow, /- release\/beta/);
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
