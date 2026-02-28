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
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-orchestrated-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: '@i-santos/init-flow',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2));
  return workDir;
}

test('init with github+beta+npm runs orchestrated setup and auto-publishes missing package', async () => {
  const workDir = createPackageDir();
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/branches/main') {
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
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/branches/release%2Fbeta') {
        return { status: 1, stderr: '404 Not Found' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'PATCH' && args[3] === '/repos/i-santos/firestack') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'PUT' && args[3] === '/repos/i-santos/firestack/actions/permissions/workflow') {
        return { status: 0, stdout: '{}' };
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
      if (command === 'gh' && args[0] === 'api' && args[2] === 'POST' && args[3] === '/repos/i-santos/firestack/rulesets') {
        return { status: 0, stdout: '{}' };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 0, stdout: 'i-santos' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' ? { status: 1, stderr: 'E404 Not Found' } : null),
    (command, args) => (command === 'npm' && args[0] === 'publish' ? { status: 0, stdout: '+ @i-santos/init-flow@1.0.0' } : null)
  ]);

  await run([
    'init',
    '--dir', workDir,
    '--with-github',
    '--with-beta',
    '--with-npm',
    '--repo', 'i-santos/firestack',
    '--yes'
  ], { exec: stub.exec });

  const publishCall = stub.calls.find((call) => call.command === 'npm' && call.args[0] === 'publish');
  assert.ok(publishCall, 'expected npm first publish during orchestrated init');

  const rulesetCalls = stub.calls.filter((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'POST' && call.args[3] === '/repos/i-santos/firestack/rulesets');
  assert.equal(rulesetCalls.length, 2);
  const payloads = rulesetCalls.map((call) => JSON.parse(call.options.input));
  for (const payload of payloads) {
    const checksRule = payload.rules.find((rule) => rule.type === 'required_status_checks');
    assert.ok(checksRule, 'expected required_status_checks rule');
    assert.equal(checksRule.parameters.required_status_checks[0].context, 'CI / required-check (pull_request)');
  }

  const ciWorkflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ciWorkflow, /required-check/);
});

test('init fails fast before local mutations when GitHub prevalidation fails', async () => {
  const workDir = createPackageDir();
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 1, stderr: 'not found' } : null)
  ]);

  await assert.rejects(
    () => run(['init', '--dir', workDir, '--with-github', '--repo', 'i-santos/firestack', '--yes'], { exec: stub.exec }),
    /GitHub CLI \(gh\) is required/
  );

  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'config.json')), false);
  assert.equal(fs.existsSync(path.join(workDir, 'CONTRIBUTING.md')), false);
});
