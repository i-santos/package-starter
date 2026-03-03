const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run, loadShipConfig, validateShipConfig, resolveAdapter } = require('../lib/run');
const { firebaseAdapter } = require('../lib/adapters/firebase');

test('ship loads default config when .ship.json is missing', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-config-default-'));
  const config = loadShipConfig(workDir);
  assert.equal(config.adapter, 'npm');
});

test('ship validates firebase adapter config contract', () => {
  assert.throws(
    () => validateShipConfig({ adapter: 'firebase' }),
    /firebase\.projectId/
  );

  assert.throws(
    () => validateShipConfig({
      adapter: 'firebase',
      firebase: { projectId: 'demo', environments: ['staging', ''] },
      deploy: { workflow: 'deploy.yml' }
    }),
    /firebase\.environments/
  );

  assert.doesNotThrow(() => validateShipConfig({
    adapter: 'firebase',
    firebase: { projectId: 'demo-project', environments: ['local', 'staging', 'production'] },
    deploy: { workflow: 'deploy.yml' }
  }));
});

test('ship prints version with --version', async () => {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const expectedVersion = require(packageJsonPath).version;
  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['--version']);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(outputs, [expectedVersion]);
});

test('ship prints bash completion script', async () => {
  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['completion', 'bash']);
  } finally {
    console.log = originalLog;
  }

  assert.equal(outputs.length, 1);
  assert.match(outputs[0], /complete -F _ship_completion ship/);
  assert.match(outputs[0], /release/);
});

test('ship prints zsh completion script', async () => {
  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['completion', 'zsh']);
  } finally {
    console.log = originalLog;
  }

  assert.equal(outputs.length, 1);
  assert.match(outputs[0], /#compdef ship/);
  assert.match(outputs[0], /compdef _ship ship/);
});

test('ship prints fish completion script', async () => {
  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['completion', 'fish']);
  } finally {
    console.log = originalLog;
  }

  assert.equal(outputs.length, 1);
  assert.match(outputs[0], /complete -c ship/);
  assert.match(outputs[0], /__fish_use_subcommand/);
});

test('ship resolves external adapter via adapterModule path', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-adapter-module-'));
  const adapterPath = path.join(workDir, 'adapter.js');
  fs.writeFileSync(
    adapterPath,
    [
      'module.exports = {',
      '  name: "custom",',
      '  capabilities: { openPr: true, release: true },',
      '  detectReleaseMode: () => "open-pr",',
      '  resolveReleaseContext: () => ({}),',
      '  findReleaseCandidates: () => [],',
      '  selectReleaseCandidate: () => null,',
      '  verifyPostMerge: () => ({ pass: true, targets: [] })',
      '};'
    ].join('\n')
  );

  const adapter = resolveAdapter('custom', {
    cwd: workDir,
    adapterModule: './adapter.js'
  });
  assert.equal(adapter.name, 'custom');
});

test('ship resolves builtin firebase adapter', () => {
  const adapter = resolveAdapter('firebase');
  assert.equal(adapter.name, 'firebase');
  assert.equal(Boolean(adapter.capabilities && adapter.capabilities.openPr), true);
  assert.equal(Boolean(adapter.capabilities && adapter.capabilities.release), true);
});

test('firebase adapter can resolve direct publish candidate from deploy workflow', () => {
  const candidates = firebaseAdapter.findReleaseCandidates({
    gitContext: { repo: 'i-santos/firestack' },
    releaseContext: { workflowBranch: 'develop', expectedReleasePrBase: 'develop' },
    args: {},
    config: { deploy: { workflow: 'deploy-staging.yml' } },
    deps: {
      exec(command, args) {
        if (command === 'gh' && args[0] === 'api') {
          return {
            status: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 123,
                status: 'completed',
                conclusion: 'success',
                html_url: 'https://github.com/i-santos/firestack/actions/runs/123'
              }]
            })
          };
        }
        return { status: 0, stdout: '' };
      }
    },
    primitives: {
      listOpenPullRequests() {
        return [];
      }
    }
  });

  assert.equal(Array.isArray(candidates), true);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'direct_publish');
});

test('firebase adapter verifies deploy workflow from config', () => {
  const verification = firebaseAdapter.verifyPostMerge({
    gitContext: { repo: 'i-santos/firestack' },
    releaseContext: { workflowBranch: 'develop' },
    config: { deploy: { workflow: 'deploy-staging.yml' } },
    deps: {
      exec(command, args) {
        if (command === 'gh' && args[0] === 'api') {
          return {
            status: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 123,
                status: 'completed',
                conclusion: 'success'
              }]
            })
          };
        }
        return { status: 1, stdout: '' };
      }
    },
    primitives: {
      assertReleaseWorkflowHealthyOrThrow() {
        throw new Error('should not be called when deploy.workflow is configured');
      }
    }
  });

  assert.equal(verification.pass, true);
});

test('ship fails fast when adapter does not implement openPr capability', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-adapter-openpr-cap-'));
  fs.writeFileSync(path.join(workDir, '.ship.json'), JSON.stringify({
    adapter: 'custom',
    adapterModule: './adapter.js'
  }, null, 2));
  fs.writeFileSync(path.join(workDir, 'adapter.js'), 'module.exports = { name: "custom", capabilities: { release: true } };');

  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['open-pr']),
      /does not implement openPr capability/
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship fails fast when adapter does not implement release capability', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-adapter-release-cap-'));
  fs.writeFileSync(path.join(workDir, '.ship.json'), JSON.stringify({
    adapter: 'custom',
    adapterModule: './adapter.js'
  }, null, 2));
  fs.writeFileSync(path.join(workDir, 'adapter.js'), 'module.exports = { name: "custom", capabilities: { openPr: true } };');

  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['release']),
      /does not implement release capability/
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task new creates canonical task state files', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-new-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Critical API integration coverage']);

    const agentsDir = path.join(workDir, '.agents');
    const stateDir = path.join(agentsDir, 'state');
    const tasksDir = path.join(stateDir, 'tasks');
    const taskFiles = fs.readdirSync(tasksDir).filter((entry) => entry.endsWith('.json'));
    assert.equal(taskFiles.length, 1);

    const task = JSON.parse(fs.readFileSync(path.join(tasksDir, taskFiles[0]), 'utf8'));
    assert.equal(task.status, 'new');
    assert.equal(task.type, 'feature');
    assert.match(task.taskId, /^tsk_\d{8}_\d{6}$/);

    const opsLog = fs.readFileSync(path.join(stateDir, 'ops.log'), 'utf8');
    assert.match(opsLog, /"action":"task.new"/);
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task status returns created task data in json mode', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-status-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Status lookup fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    outputs.length = 0;

    await run(['task', 'status', '--id', created.task.taskId, '--json']);
    const statusPayload = JSON.parse(outputs[0]);
    assert.equal(statusPayload.task.taskId, created.task.taskId);
    assert.equal(statusPayload.task.status, 'new');
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task doctor reports checks in json mode', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-doctor-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'doctor', '--json']);
    const payload = JSON.parse(outputs[0]);
    assert.equal(payload.action, 'doctor');
    assert.ok(Array.isArray(payload.checks));
    assert.ok(payload.checks.some((check) => check.name === 'engine'));
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task plan transitions task to planned and writes plan file', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-plan-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Plan fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    outputs.length = 0;

    await run(['task', 'plan', '--id', created.task.taskId, '--json']);
    const planned = JSON.parse(outputs[0]);
    assert.equal(planned.task.status, 'planned');
    assert.ok(planned.task.artifacts.planFile);
    assert.equal(fs.existsSync(path.resolve(workDir, planned.task.artifacts.planFile)), true);
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task verify transitions implemented task to verified and writes report file', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-verify-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Verify fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    const taskPath = path.join(workDir, '.agents', 'state', 'tasks', `${created.task.taskId}.json`);
    const existing = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    existing.status = 'implemented';
    fs.writeFileSync(taskPath, JSON.stringify(existing, null, 2));
    outputs.length = 0;

    await run(['task', 'verify', '--id', created.task.taskId, '--json']);
    const verified = JSON.parse(outputs[0]);
    assert.equal(verified.task.status, 'verified');
    assert.equal(verified.task.checks.unit, 'pass');
    assert.ok(verified.task.artifacts.reportFile);
    assert.equal(fs.existsSync(path.resolve(workDir, verified.task.artifacts.reportFile)), true);
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task implement transitions tdd_ready task to implemented and writes implementation file', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-implement-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Implement fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    const taskPath = path.join(workDir, '.agents', 'state', 'tasks', `${created.task.taskId}.json`);
    const existing = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    existing.status = 'tdd_ready';
    fs.writeFileSync(taskPath, JSON.stringify(existing, null, 2));
    outputs.length = 0;

    await run(['task', 'implement', '--id', created.task.taskId, '--json']);
    const implemented = JSON.parse(outputs[0]);
    assert.equal(implemented.task.status, 'implemented');
    assert.ok(implemented.task.artifacts.implementationFile);
    assert.equal(fs.existsSync(path.resolve(workDir, implemented.task.artifacts.implementationFile)), true);
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task publish-ready transitions verified task to publish_ready', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-publish-ready-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Publish ready fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    const taskPath = path.join(workDir, '.agents', 'state', 'tasks', `${created.task.taskId}.json`);
    const existing = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    existing.status = 'verified';
    existing.checks = { unit: 'pass', integration: 'pass', e2e: 'not_required' };
    fs.writeFileSync(taskPath, JSON.stringify(existing, null, 2));
    outputs.length = 0;

    await run(['task', 'publish-ready', '--id', created.task.taskId, '--json']);
    const publishReady = JSON.parse(outputs[0]);
    assert.equal(publishReady.task.status, 'publish_ready');
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});

test('ship task publish-ready rejects when required checks did not pass', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-publish-ready-fail-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    await run(['task', 'new', '--type', 'feature', '--title', 'Publish ready fail fixture', '--json']);
    const created = JSON.parse(outputs[0]);
    const taskPath = path.join(workDir, '.agents', 'state', 'tasks', `${created.task.taskId}.json`);
    const existing = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    existing.status = 'verified';
    existing.checks = { unit: 'fail', integration: 'pass', e2e: 'not_required' };
    fs.writeFileSync(taskPath, JSON.stringify(existing, null, 2));

    await assert.rejects(
      () => run(['task', 'publish-ready', '--id', created.task.taskId, '--json']),
      /Cannot mark task as publish_ready/
    );
  } finally {
    console.log = originalLog;
    process.chdir(previousCwd);
  }
});
