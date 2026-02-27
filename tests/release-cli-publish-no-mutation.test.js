const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

test('release-cli publish does not mutate version or git history', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publish-'));
  const binPath = path.resolve(__dirname, '..', 'packages', 'release-cli', 'bin', 'release-cli.js');

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'publish-package',
    version: '2.3.4'
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(workDir, '.npmrc'), 'registry=http://127.0.0.1:9\n');

  assert.equal(run('git', ['init'], workDir).status, 0);
  assert.equal(run('git', ['config', 'user.email', 'test@example.com'], workDir).status, 0);
  assert.equal(run('git', ['config', 'user.name', 'Test User'], workDir).status, 0);
  assert.equal(run('git', ['add', '-A'], workDir).status, 0);
  assert.equal(run('git', ['commit', '-m', 'chore: init'], workDir).status, 0);

  const beforeLog = run('git', ['rev-list', '--count', 'HEAD'], workDir);
  assert.equal(beforeLog.status, 0);

  const publish = run('node', [binPath, 'publish'], workDir);
  assert.notEqual(publish.status, 0, 'publish should fail without a registry');

  const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '2.3.4', 'version should not change in publish-only mode');

  const status = run('git', ['status', '--porcelain'], workDir);
  assert.equal(status.status, 0);
  assert.equal(status.stdout.trim(), '', 'git should remain clean after publish-only failure');

  const afterLog = run('git', ['rev-list', '--count', 'HEAD'], workDir);
  assert.equal(afterLog.status, 0);
  assert.equal(afterLog.stdout.trim(), beforeLog.stdout.trim(), 'publish-only should not create commits');
});
