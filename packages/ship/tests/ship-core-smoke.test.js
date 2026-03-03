const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run, loadShipConfig, resolveAdapter } = require('../lib/run');

test('ship loads default config when .ship.json is missing', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-config-default-'));
  const config = loadShipConfig(workDir);
  assert.equal(config.adapter, 'npm');
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
