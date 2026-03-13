const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../lib/run');

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

test('setup-github dry-run prints planned operations', async () => {
  const outputs = [];
  const originalLog = console.log;
  console.log = (value) => outputs.push(String(value));

  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null)
  ]);

  try {
    await run(['setup-github', '--repo', 'i-santos/firestack', '--dry-run'], {
      exec: stub.exec
    });
  } finally {
    console.log = originalLog;
  }

  assert.match(outputs.join('\n'), /GitHub\+beta setup dry-run for i-santos\/firestack/);
  assert.match(outputs.join('\n'), /would update repository settings/);
  assert.equal(stub.calls.some((call) => call.args[0] === 'api'), false);
});

test('setup-github fails with clear error when gh is missing', async () => {
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 1, stderr: 'not found' } : null)
  ]);

  await assert.rejects(
    () => run(['setup-github', '--repo', 'i-santos/firestack'], { exec: stub.exec }),
    /GitHub CLI \(gh\) is required/
  );
});

test('setup-github fails with clear error when gh auth is missing', async () => {
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 1, stderr: 'not logged in' } : null)
  ]);

  await assert.rejects(
    () => run(['setup-github', '--repo', 'i-santos/firestack'], { exec: stub.exec }),
    /gh auth login/
  );
});

test('setup-github composes expected API calls and payloads', async () => {
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
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

  await run(['setup-github', '--repo', 'i-santos/firestack'], { exec: stub.exec });

  const patchCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'PATCH');
  assert.ok(patchCall, 'expected PATCH call');
  assert.ok(patchCall.options.input, 'expected patch payload');

  const patchPayload = JSON.parse(patchCall.options.input);
  assert.equal(patchPayload.default_branch, 'main');
  assert.equal(patchPayload.delete_branch_on_merge, true);
  assert.equal(patchPayload.allow_auto_merge, true);
  assert.equal(patchPayload.allow_squash_merge, true);
  assert.equal(patchPayload.allow_merge_commit, true);
  assert.equal(patchPayload.allow_rebase_merge, true);

  const workflowPermissionsCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'PUT' && call.args[3] === '/repos/i-santos/firestack/actions/permissions/workflow');
  assert.ok(workflowPermissionsCall, 'expected workflow permissions PUT call');
  const workflowPermissionsPayload = JSON.parse(workflowPermissionsCall.options.input);
  assert.equal(workflowPermissionsPayload.default_workflow_permissions, 'write');
  assert.equal(workflowPermissionsPayload.can_approve_pull_request_reviews, true);

  const rulesetPost = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'POST' && call.args[3].includes('/rulesets'));
  assert.ok(rulesetPost, 'expected ruleset POST call');

  const rulesetPayload = JSON.parse(rulesetPost.options.input);
  assert.equal(rulesetPayload.conditions.ref_name.include[0], 'refs/heads/main');
  assert.equal(rulesetPayload.rules[2].parameters.required_approving_review_count, 0);
  const requiredChecksRule = rulesetPayload.rules.find((rule) => rule.type === 'required_status_checks');
  assert.ok(requiredChecksRule, 'expected required_status_checks rule');
  assert.equal(requiredChecksRule.parameters.required_status_checks[0].context, 'required-check');
});

test('setup-github exits non-zero on API failure', async () => {
  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'PATCH') {
        return { status: 1, stderr: 'boom' };
      }
      return null;
    }
  ]);

  await assert.rejects(
    () => run(['setup-github', '--repo', 'i-santos/firestack'], { exec: stub.exec }),
    /Failed to update repository settings: boom/
  );
});

test('setup-github firebase dry-run prints planned operations', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-github-firebase-dryrun-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({ name: '@i-santos/firestack', version: '1.0.0' }));

  const outputs = [];
  const originalLog = console.log;
  console.log = (value) => outputs.push(String(value));

  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null)
  ]);

  try {
    await run([
      'setup-github',
      '--adapter', 'firebase',
      '--dir', workDir,
      '--repo', 'i-santos/firestack',
      '--dry-run'
    ], { exec: stub.exec });
  } finally {
    console.log = originalLog;
  }

  assert.match(outputs.join('\n'), /GitHub\+firebase setup dry-run for i-santos\/firestack/);
  assert.match(outputs.join('\n'), /would ensure branch "develop" exists/);
  assert.equal(stub.calls.some((call) => call.args[0] === 'api'), false);
});

test('setup-github firebase composes expected API calls and writes local deploy workflows', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-github-firebase-apply-'));
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({ name: '@i-santos/firestack', version: '1.0.0' }));

  const stub = createExecStub([
    (command, args) => (command === 'gh' && args[0] === '--version' ? { status: 0, stdout: 'gh version 2.0.0' } : null),
    (command, args) => (command === 'gh' && args[0] === 'auth' ? { status: 0, stdout: 'ok' } : null),
    (command, args) => {
      if (command === 'gh' && args[0] === 'api' && args[2] === 'GET' && args[3] === '/repos/i-santos/firestack/branches/develop') {
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

  await run([
    'setup-github',
    '--adapter', 'firebase',
    '--dir', workDir,
    '--repo', 'i-santos/firestack',
    '--base-branch', 'develop',
    '--production-branch', 'main'
  ], { exec: stub.exec });

  const patchCall = stub.calls.find((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'PATCH');
  assert.ok(patchCall, 'expected PATCH call');
  const patchPayload = JSON.parse(patchCall.options.input);
  assert.equal(patchPayload.default_branch, 'develop');

  const rulesetPosts = stub.calls.filter((call) => call.command === 'gh' && call.args[0] === 'api' && call.args[2] === 'POST' && call.args[3].includes('/rulesets'));
  assert.equal(rulesetPosts.length, 2);
  const rulesetPayloads = rulesetPosts.map((call) => JSON.parse(call.options.input));
  const includeRefs = rulesetPayloads.map((payload) => payload.conditions.ref_name.include[0]).sort();
  assert.deepEqual(includeRefs, ['refs/heads/develop', 'refs/heads/main']);

  const stagingWorkflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'deploy-staging.yml'), 'utf8');
  const productionWorkflow = fs.readFileSync(path.join(workDir, '.github', 'workflows', 'deploy-production.yml'), 'utf8');
  assert.match(stagingWorkflow, /branches:\n      - develop/);
  assert.match(productionWorkflow, /branches:\n      - main/);
});
