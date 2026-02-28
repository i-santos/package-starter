const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('create-package-starter accepts scoped package names and includes required standards files', () => {
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
  assert.equal(packageJson.devDependencies['@changesets/cli'], '^2.29.7');
  assert.equal(packageJson.scripts.check, 'node scripts/check.js');
  assert.equal(packageJson.scripts.changeset, 'changeset');
  assert.equal(packageJson.scripts['version-packages'], 'changeset version');
  assert.equal(packageJson.scripts.release, 'npm run check && changeset publish');
  assert.equal(packageJson.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(packageJson.scripts['beta:exit'], 'changeset pre exit');
  assert.equal(packageJson.scripts['beta:version'], 'changeset version');
  assert.equal(packageJson.scripts['beta:publish'], 'changeset publish');
  assert.equal(packageJson.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');
  assert.equal(packageJson.scripts['release:beta'], undefined);
  assert.equal(packageJson.scripts['release:stable'], undefined);
  assert.equal(packageJson.scripts['release:publish'], undefined);
  assert.equal(packageJson.scripts['registry:start'], undefined);

  const config = JSON.parse(fs.readFileSync(path.join(createdDir, '.changeset', 'config.json'), 'utf8'));
  assert.equal(config.baseBranch, 'main');

  const releaseWorkflow = fs.readFileSync(path.join(createdDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(releaseWorkflow, /- main/);
  assert.match(releaseWorkflow, /- release\/beta/);
  assert.equal(fs.existsSync(path.join(createdDir, '.github', 'workflows', 'ci.yml')), true);
  assert.equal(fs.existsSync(path.join(createdDir, '.github', 'workflows', 'auto-retarget-pr.yml')), true);
  assert.equal(fs.existsSync(path.join(createdDir, '.github', 'PULL_REQUEST_TEMPLATE.md')), true);
  assert.equal(fs.existsSync(path.join(createdDir, '.github', 'CODEOWNERS')), true);
  assert.equal(fs.existsSync(path.join(createdDir, 'CONTRIBUTING.md')), true);
});

test('create-package-starter supports custom default branch flag', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-custom-branch-'));
  const binPath = path.resolve(__dirname, '..', 'packages', 'create-package-starter', 'bin', 'create-package-starter.js');

  const result = spawnSync('node', [binPath, '--name', 'branchy-package', '--out', outDir, '--default-branch', 'develop'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const createdDir = path.join(outDir, 'branchy-package');
  const config = JSON.parse(fs.readFileSync(path.join(createdDir, '.changeset', 'config.json'), 'utf8'));
  assert.equal(config.baseBranch, 'develop');

  const release = fs.readFileSync(path.join(createdDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(release, /- develop/);
});

test('create-package-starter supports release auth mode app in release workflow', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-release-auth-app-'));
  const binPath = path.resolve(__dirname, '..', 'packages', 'create-package-starter', 'bin', 'create-package-starter.js');

  const result = spawnSync('node', [binPath, '--name', 'auth-app-package', '--out', outDir, '--release-auth', 'app'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const createdDir = path.join(outDir, 'auth-app-package');
  const release = fs.readFileSync(path.join(createdDir, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(release, /Generate GitHub App token/);
  assert.match(release, /token: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
  assert.match(release, /GITHUB_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
});
