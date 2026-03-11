const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run, loadShipConfig, validateShipConfig, resolveReleaseAdapterName, resolveReleaseTargetPlan, runReleaseByTargets, resolveAdapter } = require('../lib/run');
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

  assert.throws(
    () => validateShipConfig({
      adapter: 'firebase',
      firebase: {
        projectId: 'demo-project',
        environments: ['local', 'staging', 'production'],
        healthcheckUrls: {
          staging: 'not-a-url'
        }
      },
      deploy: { workflow: 'deploy.yml' }
    }),
    /healthcheckUrls\.staging/
  );
});

test('ship validates releaseTargets and releasePolicy schema', () => {
  assert.throws(
    () => validateShipConfig({ adapter: 'npm', releaseTargets: 'firebase' }),
    /releaseTargets/
  );
  assert.throws(
    () => validateShipConfig({ adapter: 'npm', releaseTargets: ['npm', ''] }),
    /releaseTargets/
  );
  assert.throws(
    () => validateShipConfig({ adapter: 'npm', releasePolicy: { stopOnError: 'yes' } }),
    /releasePolicy\.stopOnError/
  );
  assert.doesNotThrow(() => validateShipConfig({
    adapter: 'npm',
    releaseTargets: ['npm', 'firebase'],
    releasePolicy: { stopOnError: true },
    firebase: {
      projectId: 'demo-project',
      environments: ['local', 'staging', 'production']
    },
    deploy: {
      workflow: 'deploy-staging.yml'
    }
  }));
});

test('ship resolves release adapter name from --target and releaseTargets', () => {
  assert.equal(
    resolveReleaseAdapterName({ target: 'firebase' }, { adapter: 'npm', releaseTargets: ['npm'] }),
    'firebase'
  );

  assert.equal(
    resolveReleaseAdapterName({}, { adapter: 'npm', releaseTargets: ['firebase'] }),
    'firebase'
  );

  const warnings = [];
  const selected = resolveReleaseAdapterName({}, { adapter: 'npm', releaseTargets: ['firebase', 'npm'] }, (message) => {
    warnings.push(message);
  });
  assert.equal(selected, 'firebase');
  assert.equal(warnings.length, 1);

  assert.equal(
    resolveReleaseAdapterName({}, { adapter: 'npm', releaseTargets: [] }),
    'npm'
  );
});

test('ship resolves release target plan for single and auto modes', () => {
  assert.deepEqual(
    resolveReleaseTargetPlan({ target: 'firebase', targets: 'auto' }, { adapter: 'npm', releaseTargets: ['npm', 'firebase'] }),
    ['firebase']
  );
  assert.deepEqual(
    resolveReleaseTargetPlan({ targets: 'auto' }, { adapter: 'npm', releaseTargets: ['npm', 'firebase', 'npm'] }),
    ['npm', 'firebase']
  );
  assert.deepEqual(
    resolveReleaseTargetPlan({ targets: 'auto' }, { adapter: 'npm', releaseTargets: [] }),
    ['npm']
  );
});

test('ship runs release across targets and stops on first error by default', async () => {
  const called = [];
  const error = new Error('boom-a');
  await assert.rejects(
    () => runReleaseByTargets(
      { targets: 'auto' },
      { releaseTargets: ['a', 'b'], releasePolicy: { stopOnError: true } },
      {},
      {
        warn() {},
        info() {},
        resolveAdapterByName(name) {
          return { name };
        },
        async runReleaseForTarget(args) {
          called.push(args.target);
          if (args.target === 'a') {
            throw error;
          }
        }
      }
    ),
    /boom-a/
  );
  assert.deepEqual(called, ['a']);
});

test('ship runs release across targets and continues when stopOnError is false', async () => {
  const called = [];
  await assert.rejects(
    () => runReleaseByTargets(
      { targets: 'auto' },
      { releaseTargets: ['a', 'b'], releasePolicy: { stopOnError: false } },
      {},
      {
        warn() {},
        info() {},
        resolveAdapterByName(name) {
          return { name };
        },
        async runReleaseForTarget(args) {
          called.push(args.target);
          if (args.target === 'a') {
            throw new Error('boom-a');
          }
        }
      }
    ),
    /Release failed for targets: a/
  );
  assert.deepEqual(called, ['a', 'b']);
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

test('firebase adapter verifyPostMerge fails when healthcheck URL is down', () => {
  const verification = firebaseAdapter.verifyPostMerge({
    gitContext: { repo: 'i-santos/firestack' },
    releaseContext: { workflowBranch: 'develop', track: 'beta' },
    config: {
      deploy: { workflow: 'deploy-staging.yml' },
      firebase: {
        healthcheckUrls: {
          staging: 'https://staging.example.com/health'
        }
      }
    },
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
        if (command === 'curl') {
          return { status: 0, stdout: '503' };
        }
        return { status: 1, stdout: '' };
      }
    },
    primitives: {
      assertReleaseWorkflowHealthyOrThrow() {}
    }
  });

  assert.equal(verification.pass, false);
  assert.match((verification.diagnostics || []).join('\n'), /Healthcheck failed/);
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

test('ship task status returns created task data in json mode', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-status-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);

  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => outputs.push(args.join(' '));
  try {
    fs.mkdirSync(path.join(workDir, '.admiral'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'kanban'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'kanban', 'graph.json'),
      JSON.stringify({
        version: 1,
        tasks: [{
          id: 'tsk_20260303_000001',
          title: 'Status lookup fixture',
          scope: 'general',
          status: 'todo',
          priority: 1,
          depends_on: [],
          agent: null,
          branch: null,
          workspace: null,
          retries: 0,
          hooks: {},
          metadata: {
            workflow: {
              taskId: 'tsk_20260303_000001',
              title: 'Status lookup fixture',
              type: 'feature',
              branch: '',
              workspace: '',
              status: 'new',
              createdAt: '2026-03-03T00:00:00.000Z',
              updatedAt: '2026-03-03T00:00:00.000Z',
              artifacts: {
                planFile: '',
                tddFile: '',
                implementationFile: '',
                reportFile: ''
              },
              checks: {
                unit: 'pending',
                integration: 'pending',
                e2e: 'not_required'
              },
              release: {
                prNumber: 0,
                mergeCommit: '',
                published: false
              }
            }
          }
        }]
      }, null, 2)
    );
    outputs.length = 0;

    await run(['task', 'status', '--id', 'tsk_20260303_000001', '--json']);
    const statusPayload = JSON.parse(outputs[0]);
    assert.equal(statusPayload.task.taskId, 'tsk_20260303_000001');
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

test('ship task plan instructs caller to use admiral', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-plan-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['task', 'plan', '--id', 'tsk_20260303_000001', '--json']),
      /Use "admiral task plan <id>" instead\./
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task verify instructs caller to use admiral', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-verify-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['task', 'verify', '--id', 'tsk_20260303_000001', '--json']),
      /Use "admiral task verify <id>" instead\./
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task implement instructs caller to use admiral', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-implement-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['task', 'implement', '--id', 'tsk_20260303_000001', '--json']),
      /Use "admiral task implement <id>" instead\./
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task publish-ready instructs caller to use admiral', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-publish-ready-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['task', 'publish-ready', '--id', 'tsk_20260303_000001', '--json']),
      /Use "admiral task publish-ready <id>" instead\./
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test('ship task new instructs caller to use admiral', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-task-new-unsupported-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    await assert.rejects(
      () => run(['task', 'new', '--type', 'feature', '--title', 'Publish ready fail fixture', '--json']),
      /Use "admiral task create <id>" instead\./
    );
  } finally {
    process.chdir(previousCwd);
  }
});
