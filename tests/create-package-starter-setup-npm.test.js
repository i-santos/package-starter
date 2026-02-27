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

function createPackageDir(packageName, publishConfig = { access: 'public' }) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-npm-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: packageName,
    version: '0.1.0',
    publishConfig
  }, null, 2));
  return workDir;
}

test('setup-npm dry-run reports first publish command for unpublished package', async () => {
  const outputs = [];
  const originalLog = console.log;
  console.log = (value) => outputs.push(String(value));

  const packageDir = createPackageDir('@i-santos/unpublished-pkg');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 0, stdout: 'i-santos' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' ? { status: 1, stderr: 'E404 Not Found' } : null)
  ]);

  try {
    await run(['setup-npm', '--dir', packageDir, '--publish-first', '--dry-run'], { exec: stub.exec });
  } finally {
    console.log = originalLog;
  }

  const output = outputs.join('\n');
  assert.match(output, /npm setup completed/);
  assert.match(output, /would run "npm publish --access public"/);
  assert.equal(stub.calls.some((call) => call.command === 'npm' && call.args[0] === 'publish'), false);
});

test('setup-npm fails when npm is unavailable', async () => {
  const packageDir = createPackageDir('hello-package');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 1, stderr: 'not found' } : null)
  ]);

  await assert.rejects(
    () => run(['setup-npm', '--dir', packageDir], { exec: stub.exec }),
    /npm CLI is required/
  );
});

test('setup-npm fails when npm auth is missing', async () => {
  const packageDir = createPackageDir('hello-package');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 1, stderr: 'ENEEDAUTH' } : null)
  ]);

  await assert.rejects(
    () => run(['setup-npm', '--dir', packageDir], { exec: stub.exec }),
    /npm login/
  );
});

test('setup-npm publishes first version when requested and package does not exist', async () => {
  const packageDir = createPackageDir('@i-santos/new-package');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 0, stdout: 'i-santos' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' ? { status: 1, stderr: 'E404 Not Found' } : null),
    (command, args) => (command === 'npm' && args[0] === 'publish' ? { status: 0, stdout: '+ @i-santos/new-package@0.1.0' } : null)
  ]);

  await run(['setup-npm', '--dir', packageDir, '--publish-first'], { exec: stub.exec });

  const publishCall = stub.calls.find((call) => call.command === 'npm' && call.args[0] === 'publish');
  assert.ok(publishCall, 'expected npm publish call');
  assert.equal(publishCall.args[1], '--access');
  assert.equal(publishCall.args[2], 'public');
  assert.equal(publishCall.options.cwd, packageDir);
});

test('setup-npm skips first publish when package already exists', async () => {
  const packageDir = createPackageDir('@i-santos/existing-package');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 0, stdout: 'i-santos' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' ? { status: 0, stdout: '"1.0.0"' } : null)
  ]);

  await run(['setup-npm', '--dir', packageDir, '--publish-first'], { exec: stub.exec });

  assert.equal(stub.calls.some((call) => call.command === 'npm' && call.args[0] === 'publish'), false);
});

test('setup-npm fails with actionable message when publish fails', async () => {
  const packageDir = createPackageDir('@i-santos/failing-package');
  const stub = createExecStub([
    (command, args) => (command === 'npm' && args[0] === '--version' ? { status: 0, stdout: '10.0.0' } : null),
    (command, args) => (command === 'npm' && args[0] === 'whoami' ? { status: 0, stdout: 'i-santos' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' ? { status: 1, stderr: 'E404 Not Found' } : null),
    (command, args) => (command === 'npm' && args[0] === 'publish' ? { status: 1, stderr: '403 Forbidden' } : null)
  ]);

  await assert.rejects(
    () => run(['setup-npm', '--dir', packageDir, '--publish-first'], { exec: stub.exec }),
    /First publish failed: 403 Forbidden/
  );
});
