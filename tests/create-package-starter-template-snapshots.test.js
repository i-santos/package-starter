const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const templateRoot = path.resolve(__dirname, '..', 'packages', 'create-package-starter', 'template');

function read(relativePath) {
  return fs.readFileSync(path.join(templateRoot, relativePath), 'utf8');
}

test('template release.yml snapshot', () => {
  const content = read('.github/workflows/release.yml');

  assert.match(content, /^name: Release/m);
  assert.match(content, /branches:\n\s+- __DEFAULT_BRANCH__/m);
  assert.match(content, /branches:\n[\s\S]*- __BETA_BRANCH__/m);
  assert.match(content, /id-token: write/m);
  assert.match(content, /uses: changesets\/action@v1/m);
  assert.match(content, /token: \$\{\{ secrets\.CHANGESETS_GH_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/m);
  assert.match(content, /name: Setup npm \(latest\)/m);
  assert.match(content, /title: "chore: release packages"/m);
  assert.match(content, /publish: npm run release/m);
  assert.match(content, /NODE_AUTH_TOKEN: ""/m);
});

test('template ci.yml snapshot', () => {
  const content = read('.github/workflows/ci.yml');

  assert.match(content, /^name: CI/m);
  assert.match(content, /pull_request:/m);
  assert.match(content, /branches:\n\s+- __DEFAULT_BRANCH__/m);
  assert.match(content, /branches:\n[\s\S]*- __BETA_BRANCH__/m);
  assert.match(content, /run: npm ci/m);
  assert.match(content, /run: npm run check/m);
  assert.match(content, /required-check/m);
});

test('template auto-retarget-pr.yml snapshot', () => {
  const content = read('.github/workflows/auto-retarget-pr.yml');

  assert.match(content, /^name: Auto Retarget PR Base/m);
  assert.match(content, /pull_request_target:/m);
  assert.match(content, /pull-requests: write/m);
  assert.match(content, /group: pr-retarget-\$\{\{ github\.event\.pull_request\.number \}\}/m);
  assert.match(content, /stableBase = '__DEFAULT_BRANCH__'/m);
  assert.match(content, /betaBase = '__BETA_BRANCH__'/m);
  assert.match(content, /if \(head === betaBase\)/m);
  assert.match(content, /desiredBase = betaBase;/m);
});

test('template changeset config snapshot', () => {
  const config = JSON.parse(read('.changeset/config.json'));

  assert.equal(config.$schema, 'https://unpkg.com/@changesets/config@3.0.0/schema.json');
  assert.equal(config.changelog, '@changesets/cli/changelog');
  assert.equal(config.access, 'public');
  assert.equal(config.baseBranch, '__DEFAULT_BRANCH__');
});

test('template package.json snapshot', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.equal(pkg.scripts.changeset, 'changeset');
  assert.equal(pkg.scripts['version-packages'], 'changeset version');
  assert.equal(pkg.scripts.release, 'npm run check && changeset publish');
  assert.equal(pkg.scripts['beta:enter'], 'changeset pre enter beta');
  assert.equal(pkg.scripts['beta:exit'], 'changeset pre exit');
  assert.equal(pkg.scripts['beta:version'], 'changeset version');
  assert.equal(pkg.scripts['beta:publish'], 'changeset publish');
  assert.equal(pkg.scripts['beta:promote'], 'create-package-starter promote-stable --dir .');
  assert.equal(pkg.scripts['release:beta'], undefined);
  assert.equal(pkg.devDependencies['@changesets/cli'], '^2.29.7');
});

test('template docs files snapshot', () => {
  const prTemplate = read('.github/PULL_REQUEST_TEMPLATE.md');
  const codeowners = read('.github/CODEOWNERS');
  const contributing = read('CONTRIBUTING.md');

  assert.match(prTemplate, /## Summary/);
  assert.match(codeowners, /\* @__SCOPE__/);
  assert.match(contributing, /Trusted Publishing/);
  assert.match(contributing, /npm publish --access public/);
});
