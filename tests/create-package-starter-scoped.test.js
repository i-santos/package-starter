const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('create-package-starter accepts scoped package names', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-scoped-'));
  const binPath = path.resolve(__dirname, '..', 'packages', 'create-package-starter', 'bin', 'create-package-starter.js');

  const result = spawnSync('node', [binPath, '--name', '@i-santos/swarm', '--out', outDir], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const createdDir = path.join(outDir, 'swarm');
  assert.equal(fs.existsSync(createdDir), true);

  const packageJson = JSON.parse(fs.readFileSync(path.join(createdDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, '@i-santos/swarm');
  assert.equal(packageJson.devDependencies['@i-santos/release-cli'], '^0.1.0');
  assert.equal(packageJson.devDependencies['@changesets/cli'], '^2.29.7');
  assert.equal(packageJson.scripts.changeset, 'changeset');
  assert.equal(packageJson.scripts['version-packages'], 'changeset version');
  assert.equal(packageJson.scripts.release, 'npm run check && npm run release:publish');

  assert.equal(fs.existsSync(path.join(createdDir, '.changeset', 'config.json')), true);
  assert.equal(fs.existsSync(path.join(createdDir, '.github', 'workflows', 'release.yml')), true);
});
