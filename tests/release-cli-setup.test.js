const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

test('release-cli setup scaffolds release CI/CD files and scripts', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-setup-'));
  const binPath = path.resolve(__dirname, '..', 'packages', 'release-cli', 'bin', 'release-cli.js');

  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    name: 'setup-package',
    version: '1.0.0',
    scripts: {
      check: 'node -e "process.exit(0)"'
    },
    devDependencies: {
      '@i-santos/release-cli': '^0.1.0'
    }
  }, null, 2) + '\n');

  const first = run('node', [binPath, 'setup'], workDir);
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['release:beta'], 'release-cli beta');
  assert.equal(pkg.scripts['release:stable'], 'release-cli stable');
  assert.equal(pkg.scripts['release:publish'], 'release-cli publish');
  assert.equal(pkg.scripts['registry:start'], 'release-cli registry http://127.0.0.1:4873');
  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && npm run release:publish');
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');

  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'config.json')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.changeset', 'README.md')), true);
  assert.equal(fs.existsSync(path.join(workDir, '.github', 'workflows', 'release.yml')), true);

  const second = run('node', [binPath, 'setup'], workDir);
  assert.equal(second.status, 0, second.stderr || second.stdout);
});
