const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, renderPrBodyDeterministic } = require('../lib/run');

function writeAdmiralTaskGraph(workDir, task) {
  fs.mkdirSync(path.join(workDir, '.admiral'), { recursive: true });
  fs.mkdirSync(path.join(workDir, 'kanban'), { recursive: true });
  fs.writeFileSync(
    path.join(workDir, 'kanban', 'graph.json'),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          id: task.taskId,
          title: task.title || task.taskId,
          scope: 'general',
          status: 'todo',
          priority: 1,
          depends_on: [],
          agent: null,
          branch: task.branch || null,
          workspace: task.workspace || null,
          retries: 0,
          hooks: {},
          metadata: {
            workflow: task
          }
        }
      ]
    }, null, 2)
  );
}

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

function baseHandlers() {
  return [
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' && args[1] === 'status' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree' ? { status: 0, stdout: 'true\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'fetch' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-list' && args[1] === '--left-right' ? { status: 0, stdout: '1 0\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'merge-base' && args[1] === '--is-ancestor' ? { status: 1, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'log' && args[1] === '-1' ? { status: 0, stdout: 'feat: title\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'log' && args[1] === '-n10' ? { status: 0, stdout: 'abc123 feat: sample\n' } : null)
  ];
}

test('open-pr creates PR, enables auto-merge, and watches checks', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/test\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' && args[1] === '--set-upstream' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: '[]' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
      ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/12\n' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto')
      ? { status: 0, stdout: 'auto-merge enabled' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null)
  ]);

  // second list call returns created PR
  let listCall = 0;
  const originalExec = stub.exec;
  stub.exec = (command, args, options = {}) => {
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
      listCall += 1;
      if (listCall === 1) {
        return { status: 0, stdout: '[]', stderr: '' };
      }
      return {
        status: 0,
        stdout: JSON.stringify([{
          number: 12,
          url: 'https://github.com/i-santos/firestack/pull/12',
          headRefName: 'feat/test',
          baseRefName: 'release/beta'
        }]),
        stderr: ''
      };
    }

    return originalExec(command, args, options);
  };

  await run(['open-pr', '--repo', 'i-santos/firestack', '--auto-merge', '--watch-checks', '--yes'], { exec: stub.exec });

  const createCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'create');
  assert.ok(createCall, 'expected gh pr create');
  assert.ok(createCall.args.includes('--base'));
  assert.ok(createCall.args.includes('release/beta'));
  assert.ok(createCall.args.includes('--head'));
  assert.ok(createCall.args.includes('feat/test'));

  const autoMergeCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'merge' && call.args.includes('--auto'));
  assert.ok(autoMergeCall, 'expected gh pr merge --auto');
});

test('open-pr updates existing PR when head/base already has one', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/existing\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 0, stdout: 'origin/feat/existing\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-list' ? { status: 0, stdout: '0\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'up-to-date' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? {
        status: 0,
        stdout: JSON.stringify([{
          number: 44,
          url: 'https://github.com/i-santos/firestack/pull/44',
          headRefName: 'feat/existing',
          baseRefName: 'release/beta'
        }])
      }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'edit'
      ? { status: 0, stdout: 'updated' }
      : null)
  ]);

  await run(['open-pr', '--repo', 'i-santos/firestack', '--pr-description', 'custom body', '--yes'], { exec: stub.exec });

  const editCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'edit');
  assert.ok(editCall, 'expected gh pr edit');
  const createCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'create');
  assert.equal(createCall, undefined);
});

test('open-pr links PR to task when --task-id is provided', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-openpr-task-link-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    writeAdmiralTaskGraph(workDir, { taskId: 'tsk_20260303_000001', status: 'publish_ready' });

    const stub = createExecStub([
      ...baseHandlers(),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/task-link\n' } : null),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
      (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
        ? {
          status: 0,
          stdout: JSON.stringify([{
            number: 55,
            url: 'https://github.com/i-santos/firestack/pull/55',
            headRefName: 'feat/task-link',
            baseRefName: 'release/beta'
          }])
        }
        : null)
    ]);

    await run(['open-pr', '--repo', 'i-santos/firestack', '--task-id', 'tsk_20260303_000001', '--yes'], { exec: stub.exec });

    const graph = JSON.parse(fs.readFileSync(path.join(workDir, 'kanban', 'graph.json'), 'utf8'));
    const updated = graph.tasks.find((task) => task.id === 'tsk_20260303_000001');
    assert.equal(updated.metadata.workflow.release.prNumber, 55);
  } finally {
    process.chdir(previousCwd);
  }
});

test('release with auto-merge does not explicitly merge code PR', async () => {
  const calls = [];
  let listCall = 0;
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args, options) => {
      calls.push({ command, args, options });
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/auto-flow\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        listCall += 1;
        if (listCall === 1) {
          return { status: 0, stdout: '[]' };
        }
        if (listCall === 2) {
          return {
            status: 0,
            stdout: JSON.stringify([{
              number: 303,
              url: 'https://github.com/i-santos/firestack/pull/303',
              headRefName: 'feat/auto-flow',
              baseRefName: 'release/beta'
            }])
          };
        }
        return {
          status: 0,
          stdout: JSON.stringify([{
            number: 404,
            url: 'https://github.com/i-santos/firestack/pull/404',
            headRefName: 'changeset-release/release/beta',
            baseRefName: 'release/beta'
          }])
        };
      }
      return null;
    },
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
      ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/303\n' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.1.0-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"2.1.0-beta.0"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const codePrExplicitMerge = calls.find((call) => call.command === 'gh'
    && call.args[0] === 'pr'
    && call.args[1] === 'merge'
    && call.args.includes('303')
    && call.args.includes('--delete-branch'));
  assert.equal(codePrExplicitMerge, undefined, 'expected no explicit merge for code PR when auto-merge is enabled');

  const codePrAutoMergeEnable = calls.find((call) => call.command === 'gh'
    && call.args[0] === 'pr'
    && call.args[1] === 'merge'
    && call.args.includes('303')
    && call.args.includes('--auto'));
  assert.ok(codePrAutoMergeEnable, 'expected auto-merge enable call for code PR');
});

test('release marks task merged and released when --task-id is provided', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-release-task-link-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    writeAdmiralTaskGraph(workDir, { taskId: 'tsk_20260303_000002', status: 'publish_ready', release: { prNumber: 98 } });

    const stub = createExecStub([
      ...baseHandlers(),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
        ? {
          status: 0,
          stdout: JSON.stringify([{
            number: 98,
            url: 'https://github.com/i-santos/firestack/pull/98',
            headRefName: 'changeset-release/release/beta',
            baseRefName: 'release/beta'
          }])
        }
        : null),
      (command, args) => {
        if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && args.includes('mergeCommit')) {
          return { status: 0, stdout: JSON.stringify({ mergeCommit: { oid: 'abc123merge' } }) };
        }
        if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
          return { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) };
        }
        return null;
      },
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
      (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
          const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '9.9.9-beta.1' }), 'utf8').toString('base64');
          return { status: 0, stdout: JSON.stringify({ content: encoded }) };
        }
        return null;
      },
      (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"9.9.9-beta.1"\n' } : null),
      (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"9.9.9-beta.1"}\n' } : null),
      (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null)
    ]);

    await run(['release', '--repo', 'i-santos/firestack', '--task-id', 'tsk_20260303_000002', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

    const graph = JSON.parse(fs.readFileSync(path.join(workDir, 'kanban', 'graph.json'), 'utf8'));
    const updated = graph.tasks.find((task) => task.id === 'tsk_20260303_000002');
    assert.equal(updated.metadata.workflow.release.mergeCommit, 'abc123merge');
    assert.equal(updated.metadata.workflow.release.published, true);
  } finally {
    process.chdir(previousCwd);
  }
});

test('release full uses release PR matching beta track base branch', async () => {
  const calls = [];
  let listCall = 0;
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args, options) => {
      calls.push({ command, args, options });
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/beta-track\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        listCall += 1;
        if (listCall === 1) {
          return { status: 0, stdout: '[]' };
        }
        if (listCall === 2) {
          return {
            status: 0,
            stdout: JSON.stringify([{
              number: 321,
              url: 'https://github.com/i-santos/firestack/pull/321',
              headRefName: 'feat/beta-track',
              baseRefName: 'release/beta'
            }])
          };
        }
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              number: 401,
              url: 'https://github.com/i-santos/firestack/pull/401',
              headRefName: 'changeset-release/release/beta',
              baseRefName: 'release/beta'
            },
            {
              number: 402,
              url: 'https://github.com/i-santos/firestack/pull/402',
              headRefName: 'changeset-release/release/beta-main',
              baseRefName: 'main'
            }
          ])
        };
      }
      return null;
    },
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
      ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/321\n' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.3.0-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"2.3.0-beta.0"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--phase', 'full', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const mergedReleasePr = calls.find((call) => call.command === 'gh'
    && call.args[0] === 'pr'
    && call.args[1] === 'merge'
    && call.args.includes('401'));
  assert.ok(mergedReleasePr, 'expected beta-track release PR to be selected and merged');
});

test('release auto mode detects publish on changeset-release branch and enables auto-merge', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? {
        status: 0,
        stdout: JSON.stringify([{
          number: 98,
          url: 'https://github.com/i-santos/firestack/pull/98',
          headRefName: 'changeset-release/release/beta',
          baseRefName: 'release/beta'
        }])
      }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--delete-branch')
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '1.1.0-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"1.1.0-beta.0"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const mergeCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'merge' && call.args.includes('--auto'));
  assert.ok(mergeCall, 'expected release PR auto-merge enable');
});

test('release auto mode fails on ambiguous release PR candidates', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? {
        status: 0,
        stdout: JSON.stringify([
          { number: 10, url: 'https://github.com/i-santos/firestack/pull/10', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' },
          { number: 11, url: 'https://github.com/i-santos/firestack/pull/11', headRefName: 'changeset-release/release/beta-2', baseRefName: 'release/beta' }
        ])
      }
      : null)
  ]);

  await assert.rejects(
    () => run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec }),
    /Multiple candidate release PRs detected/
  );
});

test('deterministic PR body renderer merges template placeholder and changeset metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-body-'));
  fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.changeset'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.github', 'PULL_REQUEST_TEMPLATE.md'), '## Custom Header\n\n<!-- GENERATED_PR_BODY -->\n');
  fs.writeFileSync(path.join(tmpDir, '.changeset', 'demo.md'), [
    '---',
    '"@i-santos/ship": minor',
    '---',
    '',
    'changes'
  ].join('\n'));

  const deps = {
    exec(command, args) {
      if (command === 'git' && args[0] === 'log' && args[1] === '-n10') {
        return { status: 0, stdout: 'abc123 feat: add open-pr\n' };
      }

      return { status: 0, stdout: '' };
    }
  };

  const body = renderPrBodyDeterministic({
    head: 'feat/open-pr',
    base: 'release/beta'
  }, deps, { cwd: tmpDir });

  assert.match(body, /## Custom Header/);
  assert.match(body, /## Summary/);
  assert.match(body, /@i-santos\/ship/);
  assert.match(body, /## Checklist/);
});

test('release --promote-stable rejects when not on release/beta', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/not-beta\n' } : null)
  ]);

  await assert.rejects(
    () => run(['release', '--repo', 'i-santos/firestack', '--promote-stable', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec }),
    /only allowed when running from "release\/beta"/
  );
});

test('release --promote-stable dispatches workflow and does not push release/beta', async () => {
  const calls = [];
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args, options) => {
      calls.push({ command, args, options });
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'api' && args[2] === 'POST' && String(args[3]).includes('/actions/workflows/promote-stable.yml/dispatches') ? { status: 0, stdout: '{}' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? {
        status: 0,
        stdout: JSON.stringify([
          {
            number: 77,
            url: 'https://github.com/i-santos/firestack/pull/77',
            headRefName: 'promote/stable-123',
            baseRefName: 'release/beta'
          },
          {
            number: 88,
            url: 'https://github.com/i-santos/firestack/pull/88',
            headRefName: 'release/beta',
            baseRefName: 'main'
          },
          {
            number: 99,
            url: 'https://github.com/i-santos/firestack/pull/99',
            headRefName: 'changeset-release/release/beta',
            baseRefName: 'main'
          }
        ])
      }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.2.3"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"latest":"1.2.3"}\n' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=main')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '1.2.3' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run([
    'release',
    '--repo', 'i-santos/firestack',
    '--promote-stable',
    '--yes',
    '--check-timeout', '0.05',
    '--release-pr-timeout', '0.05'
  ], { exec: stub.exec });

  const dispatchCall = calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'POST' && String(call.args[3]).includes('/actions/workflows/promote-stable.yml/dispatches'));
  assert.ok(dispatchCall, 'expected promote-stable workflow dispatch');

  const pushReleaseBeta = calls.find((call) => call.command === 'git' && call.args[0] === 'push' && call.args.includes('release/beta'));
  assert.equal(pushReleaseBeta, undefined, 'expected no direct push to release/beta');
});

test('release validates npm tag and version for beta track', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 101, url: 'https://github.com/i-santos/firestack/pull/101', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '1.2.3-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"1.2.3-beta.0"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: ' M local-file\n' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });
});

test('release accepts beta propagation when prerelease is visible before beta tag is set', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 101, url: 'https://github.com/i-santos/firestack/pull/101', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.0.0-beta.15' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"2.0.0-beta.15"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"latest":"2.0.0-beta.15"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });
});

test('release fails fast when release workflow has failed before npm propagation', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 101, url: 'https://github.com/i-santos/firestack/pull/101', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.0.0-beta.18' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'gh' && args[0] === 'run' && args[1] === 'list'
      ? {
        status: 0,
        stdout: JSON.stringify([{
          databaseId: 999,
          workflowName: 'Release',
          status: 'completed',
          conclusion: 'failure',
          url: 'https://github.com/i-santos/firestack/actions/runs/999',
          updatedAt: '2026-03-02T12:00:00Z',
          createdAt: '2026-03-02T11:58:00Z',
          event: 'push'
        }])
      }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'run' && args[1] === 'view' && args.includes('--log-failed')
      ? { status: 0, stdout: 'publish step failed: trusted publishing not configured\n' }
      : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"2.0.0-beta.17"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"2.0.0-beta.17"}\n' } : null)
  ]);

  await assert.rejects(
    () => run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec }),
    /Release workflow failed before npm propagation could complete\./
  );
});

test('release resolves npm target package from release PR files in monorepo', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 500, url: 'https://github.com/i-santos/firestack/pull/500', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/pulls/500/files')) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { filename: 'package.json', status: 'modified' },
            { filename: 'examples/hello-package/package.json', status: 'modified' }
          ])
        };
      }

      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '1.5.0-beta.11' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }

      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/examples/hello-package/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: 'hello-package', version: '1.0.4', private: true }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }

      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: 'ship', version: '1.0.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }

      return null;
    },
    (command, args) => {
      if (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'version') {
        return { status: 0, stdout: '"1.4.0"\n' };
      }

      if (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'dist-tags') {
        return { status: 0, stdout: '{"beta":"1.5.0-beta.11","latest":"1.4.0"}\n' };
      }

      if (command === 'npm' && args[0] === 'view' && args[1] === 'ship') {
        return { status: 0, stdout: '"0.2.1"\n' };
      }

      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const npmCalls = stub.calls
    .filter((call) => call.command === 'npm' && call.args[0] === 'view')
    .map((call) => `${call.args[1]}:${call.args[2]}`);

  assert.ok(npmCalls.includes('@i-santos/ship:dist-tags'), 'expected validation on workspace package');
  assert.equal(npmCalls.some((entry) => entry.startsWith('ship:')), false, 'expected root package not to be validated');
  assert.equal(npmCalls.some((entry) => entry.startsWith('hello-package:')), false, 'expected private example package not to be validated');
});

test('release skips cleanup with --no-cleanup', async () => {
  const calls = [];
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args, options) => {
      calls.push({ command, args, options });
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 202, url: 'https://github.com/i-santos/firestack/pull/202', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view' ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' ? { status: 0, stdout: 'merged' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.0.0-beta.1' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"2.0.0-beta.1"}\n' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--no-cleanup', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const cleanupDeleteCall = calls.find((call) => call.command === 'git' && call.args[0] === 'branch' && call.args[1] === '-d');
  assert.equal(cleanupDeleteCall, undefined, 'expected cleanup delete branch to be skipped');
});

test('release --phase code stops after code PR merge', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/phase-code\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 505, url: 'https://github.com/i-santos/firestack/pull/505', headRefName: 'feat/phase-code', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto') ? { status: 0, stdout: 'auto' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--phase', 'code', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const npmViewCall = stub.calls.find((call) => call.command === 'npm' && call.args[0] === 'view');
  assert.equal(npmViewCall, undefined, 'expected no npm validation in code-only mode');
  const editCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'edit');
  assert.equal(editCall, undefined, 'expected existing PR to be reused without edit by default');
});

test('release fails when release PR needs approval before merge', async () => {
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'changeset-release/release/beta\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 606, url: 'https://github.com/i-santos/firestack/pull/606', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && args.includes('statusCheckRollup,url,number')) {
        return { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'OPEN' }) };
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && args.includes('number,url,reviewDecision,mergeStateStatus,isDraft,headRefName')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 606,
            url: 'https://github.com/i-santos/firestack/pull/606',
            reviewDecision: 'REVIEW_REQUIRED',
            mergeStateStatus: 'BLOCKED',
            isDraft: false,
            headRefName: 'changeset-release/release/beta'
          })
        };
      }
      return null;
    }
  ]);

  await assert.rejects(
    () => run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec }),
    /requires review approval/
  );
});

test('release auto syncs feature branch with release/beta when behind', async () => {
  const stub = createExecStub([
    (command, args) => (command === 'git' && args[0] === 'rev-list' && args[1] === '--left-right' ? { status: 0, stdout: '1 2\n' } : null),
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/sync-base\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'rebase' ? { status: 0, stdout: 'rebased' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 707, url: 'https://github.com/i-santos/firestack/pull/707', headRefName: 'feat/sync-base', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'edit' ? { status: 0, stdout: 'updated' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto') ? { status: 0, stdout: 'auto' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--phase', 'code', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const rebaseCall = stub.calls.find((call) => call.command === 'git' && call.args[0] === 'rebase');
  assert.ok(rebaseCall, 'expected rebase while syncing branch with base');
});

test('release resumes from release phase when code branch is already integrated', async () => {
  const calls = [];
  const stub = createExecStub([
    (command, args, options) => {
      calls.push({ command, args, options });
      return null;
    },
    (command, args) => (command === 'git' && args[0] === 'merge-base' && args[1] === '--is-ancestor' ? { status: 0, stdout: '' } : null),
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/already-merged\n' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 808, url: 'https://github.com/i-santos/firestack/pull/808', headRefName: 'changeset-release/release/beta', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z', reviewDecision: 'APPROVED', mergeStateStatus: 'CLEAN', isDraft: false }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto') ? { status: 0, stdout: 'auto' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '2.2.0-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }
      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'version' ? { status: 0, stdout: '"1.4.0"\n' } : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[2] === 'dist-tags' ? { status: 0, stdout: '{"beta":"2.2.0-beta.0"}\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run(['release', '--repo', 'i-santos/firestack', '--yes', '--check-timeout', '0.05', '--release-pr-timeout', '0.05'], { exec: stub.exec });

  const pushCall = calls.find((call) => call.command === 'git' && call.args[0] === 'push');
  assert.equal(pushCall, undefined, 'expected no feature branch push while resuming');
});

test('release updates existing PR description only with --update-pr-description', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-pr-description-'));
  const prDescriptionFile = path.join(tempDir, 'pr-description.md');
  fs.writeFileSync(prDescriptionFile, 'Updated PR description from file alias.\n');

  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/update-body\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 0, stdout: 'origin/feat/update-body\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-list' ? { status: 0, stdout: '1\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'updated' } : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
      ? { status: 0, stdout: JSON.stringify([{ number: 909, url: 'https://github.com/i-santos/firestack/pull/909', headRefName: 'feat/update-body', baseRefName: 'release/beta' }]) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'edit'
      ? { status: 0, stdout: 'updated' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto')
      ? { status: 0, stdout: 'auto' }
      : null)
  ]);

  await run([
    'release',
    '--repo', 'i-santos/firestack',
    '--yes',
    '--phase', 'code',
    '--pr-description-file', prDescriptionFile,
    '--update-pr-description',
    '--check-timeout', '0.05',
    '--release-pr-timeout', '0.05'
  ], { exec: stub.exec });

  const editCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'edit');
  assert.ok(editCall, 'expected existing PR to be edited when --update-pr-description is provided');
});

test('release handles direct publish path when no release PR is created', async () => {
  let listCall = 0;
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/direct-publish\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        listCall += 1;
        if (listCall === 1) {
          return { status: 0, stdout: '[]' };
        }
        if (listCall === 2) {
          return {
            status: 0,
            stdout: JSON.stringify([{
              number: 700,
              url: 'https://github.com/i-santos/firestack/pull/700',
              headRefName: 'feat/direct-publish',
              baseRefName: 'release/beta'
            }])
          };
        }

        return { status: 0, stdout: '[]' };
      }
      return null;
    },
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
      ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/700\n' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'run' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([{
            databaseId: 123,
            workflowName: 'Release',
            status: 'completed',
            conclusion: 'success',
            url: 'https://github.com/i-santos/firestack/actions/runs/123',
            updatedAt: '2999-01-01T00:00:00Z',
            createdAt: '2999-01-01T00:00:00Z',
            event: 'push'
          }])
        };
      }

      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '1.6.0-beta.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }

      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'version'
      ? { status: 0, stdout: '"1.4.0"\n' }
      : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'dist-tags'
      ? { status: 0, stdout: '{"beta":"1.6.0-beta.0"}\n' }
      : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run([
    'release',
    '--repo', 'i-santos/firestack',
    '--yes',
    '--phase', 'full',
    '--check-timeout', '0.05',
    '--release-pr-timeout', '0.05'
  ], { exec: stub.exec });
});

test('release treats stable latest as satisfied when beta tag is absent and no changeset was produced', async () => {
  let listCall = 0;
  const stub = createExecStub([
    ...baseHandlers(),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/no-changeset\n' } : null),
    (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
    (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        listCall += 1;
        if (listCall === 1) {
          return { status: 0, stdout: '[]' };
        }
        if (listCall === 2) {
          return {
            status: 0,
            stdout: JSON.stringify([{
              number: 701,
              url: 'https://github.com/i-santos/firestack/pull/701',
              headRefName: 'feat/no-changeset',
              baseRefName: 'release/beta'
            }])
          };
        }

        return { status: 0, stdout: '[]' };
      }
      return null;
    },
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
      ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/701\n' }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
      : null),
    (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
      ? { status: 0, stdout: 'merged' }
      : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'run' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([{
            databaseId: 124,
            workflowName: 'Release',
            status: 'completed',
            conclusion: 'success',
            url: 'https://github.com/i-santos/firestack/actions/runs/124',
            updatedAt: '2999-01-01T00:00:00Z',
            createdAt: '2999-01-01T00:00:00Z',
            event: 'push'
          }])
        };
      }

      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/contents/package.json?ref=release%2Fbeta')) {
        const encoded = Buffer.from(JSON.stringify({ name: '@i-santos/ship', version: '0.1.0' }), 'utf8').toString('base64');
        return { status: 0, stdout: JSON.stringify({ content: encoded }) };
      }

      return null;
    },
    (command, args) => (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'version'
      ? { status: 0, stdout: '"0.1.0"\n' }
      : null),
    (command, args) => (command === 'npm' && args[0] === 'view' && args[1] === '@i-santos/ship' && args[2] === 'dist-tags'
      ? { status: 0, stdout: '{"latest":"0.1.0"}\n' }
      : null),
    (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
    (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
  ]);

  await run([
    'release',
    '--repo', 'i-santos/firestack',
    '--yes',
    '--phase', 'full',
    '--check-timeout', '0.05',
    '--release-pr-timeout', '0.05'
  ], { exec: stub.exec });
});

test('release with firebase adapter succeeds via deploy workflow direct publish', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-release-firebase-success-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    fs.writeFileSync(path.join(workDir, '.ship.json'), JSON.stringify({
      adapter: 'firebase',
      baseBranch: 'develop',
      firebase: {
        projectId: 'demo-present-goal',
        environments: ['local', 'staging', 'production']
      },
      deploy: {
        workflow: 'deploy-staging.yml'
      }
    }, null, 2));

    let listCall = 0;
    const stub = createExecStub([
      ...baseHandlers(),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'feat/firebase-release\n' } : null),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args.includes('@{u}') ? { status: 1, stderr: 'no upstream' } : null),
      (command, args) => (command === 'git' && args[0] === 'push' ? { status: 0, stdout: 'ok' } : null),
      (command, args) => {
        if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
          listCall += 1;
          if (listCall === 1) {
            return { status: 0, stdout: '[]' };
          }
          if (listCall === 2) {
            return {
              status: 0,
              stdout: JSON.stringify([{
                number: 811,
                url: 'https://github.com/i-santos/firestack/pull/811',
                headRefName: 'feat/firebase-release',
                baseRefName: 'develop'
              }])
            };
          }
          return { status: 0, stdout: '[]' };
        }
        return null;
      },
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'create'
        ? { status: 0, stdout: 'https://github.com/i-santos/firestack/pull/811\n' }
        : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
        ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
        : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
        ? { status: 0, stdout: 'merged' }
        : null),
      (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/actions/workflows/deploy-staging.yml/runs?branch=develop')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 1234,
                name: 'Deploy Staging',
                status: 'completed',
                conclusion: 'success',
                html_url: 'https://github.com/i-santos/firestack/actions/runs/1234'
              }]
            })
          };
        }
        return null;
      },
      (command, args) => (command === 'git' && args[0] === 'status' ? { status: 0, stdout: '' } : null),
      (command, args) => (command === 'git' && args[0] === 'checkout' ? { status: 0, stdout: '' } : null),
      (command, args) => (command === 'git' && args[0] === 'pull' ? { status: 0, stdout: '' } : null),
      (command, args) => (command === 'git' && args[0] === 'branch' && args[1] === '-d' ? { status: 0, stdout: 'deleted' } : null)
    ]);

    await run([
      'release',
      '--repo', 'i-santos/firestack',
      '--yes',
      '--phase', 'full',
      '--check-timeout', '0.05',
      '--release-pr-timeout', '0.05'
    ], { exec: stub.exec });

    const npmCalls = stub.calls.filter((call) => call.command === 'npm');
    assert.equal(npmCalls.length, 0, 'expected no npm validation calls for firebase adapter');

    const workflowCall = stub.calls.find((call) => call.command === 'gh'
      && call.args[0] === 'api'
      && call.args[2] === 'GET'
      && String(call.args[3]).includes('/actions/workflows/deploy-staging.yml/runs?branch=develop'));
    assert.ok(workflowCall, 'expected deploy workflow polling for firebase direct publish');
  } finally {
    process.chdir(previousCwd);
  }
});

test('release with firebase adapter fails when deploy workflow is not successful', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-release-firebase-fail-'));
  const previousCwd = process.cwd();
  process.chdir(workDir);
  try {
    fs.writeFileSync(path.join(workDir, '.ship.json'), JSON.stringify({
      adapter: 'firebase',
      baseBranch: 'develop',
      firebase: {
        projectId: 'demo-present-goal',
        environments: ['local', 'staging', 'production']
      },
      deploy: {
        workflow: 'deploy-staging.yml'
      }
    }, null, 2));

    const stub = createExecStub([
      ...baseHandlers(),
      (command, args) => (command === 'git' && args[0] === 'rev-parse' && args[1] === '--abbrev-ref' ? { status: 0, stdout: 'release/beta\n' } : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'list'
        ? {
          status: 0,
          stdout: JSON.stringify([{
            number: 901,
            url: 'https://github.com/i-santos/firestack/pull/901',
            headRefName: 'release/staging-20260303',
            baseRefName: 'develop'
          }])
        }
        : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'view'
        ? { status: 0, stdout: JSON.stringify({ statusCheckRollup: [], state: 'MERGED', mergedAt: '2026-03-01T00:00:00Z' }) }
        : null),
      (command, args) => (command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
        ? { status: 0, stdout: 'merged' }
        : null),
      (command, args) => {
        if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && String(args[3]).includes('/actions/workflows/deploy-staging.yml/runs?branch=develop')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 5678,
                name: 'Deploy Staging',
                status: 'completed',
                conclusion: 'failure',
                html_url: 'https://github.com/i-santos/firestack/actions/runs/5678'
              }]
            })
          };
        }
        return null;
      }
    ]);

    await assert.rejects(
      () => run([
        'release',
        '--repo', 'i-santos/firestack',
        '--yes',
        '--check-timeout', '0.05',
        '--release-pr-timeout', '0.05'
      ], { exec: stub.exec }),
      /Deploy workflow \"deploy-staging\.yml\" is not successful yet/
    );
  } finally {
    process.chdir(previousCwd);
  }
});
