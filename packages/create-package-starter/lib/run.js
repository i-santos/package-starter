const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');

const CHANGESETS_DEP = '@changesets/cli';
const CHANGESETS_DEP_VERSION = '^2.29.7';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_RULESET_NAME = 'Default main branch protection';

const MANAGED_FILE_SPECS = [
  ['.changeset/config.json', '.changeset/config.json'],
  ['.changeset/README.md', '.changeset/README.md'],
  ['.github/workflows/ci.yml', '.github/workflows/ci.yml'],
  ['.github/workflows/release.yml', '.github/workflows/release.yml'],
  ['.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md'],
  ['.github/CODEOWNERS', '.github/CODEOWNERS'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
  ['README.md', 'README.md'],
  ['.gitignore', '.gitignore']
];

function usage() {
  return [
    'Usage:',
    '  create-package-starter --name <name> [--out <directory>] [--default-branch <branch>]',
    '  create-package-starter init [--dir <directory>] [--force] [--cleanup-legacy-release] [--scope <scope>] [--default-branch <branch>]',
    '  create-package-starter setup-github [--repo <owner/repo>] [--default-branch <branch>] [--ruleset <path>] [--dry-run]',
    '  create-package-starter setup-beta [--dir <directory>] [--repo <owner/repo>] [--beta-branch <branch>] [--default-branch <branch>] [--force] [--dry-run] [--yes]',
    '  create-package-starter promote-stable [--dir <directory>] [--type patch|minor|major] [--summary <text>] [--dry-run]',
    '  create-package-starter setup-npm [--dir <directory>] [--publish-first] [--dry-run]',
    '',
    'Examples:',
    '  create-package-starter --name hello-package',
    '  create-package-starter --name @i-santos/swarm --out ./packages',
    '  create-package-starter init --dir ./my-package',
    '  create-package-starter init --cleanup-legacy-release',
    '  create-package-starter setup-github --repo i-santos/firestack --dry-run',
    '  create-package-starter setup-beta --dir . --beta-branch release/beta',
    '  create-package-starter promote-stable --dir . --type patch --summary "Promote beta to stable"',
    '  create-package-starter setup-npm --dir . --publish-first'
  ].join('\n');
}

function parseValueFlag(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}\\n\\n${usage()}`);
  }

  return value;
}

function parseCreateArgs(argv) {
  const args = {
    out: process.cwd(),
    defaultBranch: DEFAULT_BASE_BRANCH
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--name') {
      args.name = parseValueFlag(argv, i, '--name');
      i += 1;
      continue;
    }

    if (token === '--out') {
      args.out = parseValueFlag(argv, i, '--out');
      i += 1;
      continue;
    }

    if (token === '--default-branch') {
      args.defaultBranch = parseValueFlag(argv, i, '--default-branch');
      i += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\\n\\n${usage()}`);
  }

  return args;
}

function parseInitArgs(argv) {
  const args = {
    dir: process.cwd(),
    force: false,
    cleanupLegacyRelease: false,
    defaultBranch: DEFAULT_BASE_BRANCH,
    scope: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
      i += 1;
      continue;
    }

    if (token === '--repo') {
      args.repo = parseValueFlag(argv, i, '--repo');
      i += 1;
      continue;
    }

    if (token === '--scope') {
      args.scope = parseValueFlag(argv, i, '--scope');
      i += 1;
      continue;
    }

    if (token === '--default-branch') {
      args.defaultBranch = parseValueFlag(argv, i, '--default-branch');
      i += 1;
      continue;
    }

    if (token === '--force') {
      args.force = true;
      continue;
    }

    if (token === '--cleanup-legacy-release') {
      args.cleanupLegacyRelease = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\\n\\n${usage()}`);
  }

  return args;
}

function parseSetupGithubArgs(argv) {
  const args = {
    defaultBranch: DEFAULT_BASE_BRANCH,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--repo') {
      args.repo = parseValueFlag(argv, i, '--repo');
      i += 1;
      continue;
    }

    if (token === '--default-branch') {
      args.defaultBranch = parseValueFlag(argv, i, '--default-branch');
      i += 1;
      continue;
    }

    if (token === '--ruleset') {
      args.ruleset = parseValueFlag(argv, i, '--ruleset');
      i += 1;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\\n\\n${usage()}`);
  }

  return args;
}

function parseSetupNpmArgs(argv) {
  const args = {
    dir: process.cwd(),
    publishFirst: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
      i += 1;
      continue;
    }

    if (token === '--publish-first') {
      args.publishFirst = true;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\n\n${usage()}`);
  }

  return args;
}

function parseSetupBetaArgs(argv) {
  const args = {
    dir: process.cwd(),
    betaBranch: 'release/beta',
    defaultBranch: DEFAULT_BASE_BRANCH,
    force: false,
    yes: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
      i += 1;
      continue;
    }

    if (token === '--repo') {
      args.repo = parseValueFlag(argv, i, '--repo');
      i += 1;
      continue;
    }

    if (token === '--beta-branch') {
      args.betaBranch = parseValueFlag(argv, i, '--beta-branch');
      i += 1;
      continue;
    }

    if (token === '--default-branch') {
      args.defaultBranch = parseValueFlag(argv, i, '--default-branch');
      i += 1;
      continue;
    }

    if (token === '--force') {
      args.force = true;
      continue;
    }

    if (token === '--yes') {
      args.yes = true;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\n\n${usage()}`);
  }

  return args;
}

function parsePromoteStableArgs(argv) {
  const args = {
    dir: process.cwd(),
    type: 'patch',
    summary: 'Promote beta track to stable release.',
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
      i += 1;
      continue;
    }

    if (token === '--type') {
      args.type = parseValueFlag(argv, i, '--type');
      i += 1;
      continue;
    }

    if (token === '--summary') {
      args.summary = parseValueFlag(argv, i, '--summary');
      i += 1;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\n\n${usage()}`);
  }

  if (!['patch', 'minor', 'major'].includes(args.type)) {
    throw new Error(`Invalid --type value: ${args.type}. Expected patch, minor, or major.`);
  }

  return args;
}

function parseArgs(argv) {
  if (argv[0] === 'init') {
    return {
      mode: 'init',
      args: parseInitArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'setup-github') {
    return {
      mode: 'setup-github',
      args: parseSetupGithubArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'setup-npm') {
    return {
      mode: 'setup-npm',
      args: parseSetupNpmArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'setup-beta') {
    return {
      mode: 'setup-beta',
      args: parseSetupBetaArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'promote-stable') {
    return {
      mode: 'promote-stable',
      args: parsePromoteStableArgs(argv.slice(1))
    };
  }

  return {
    mode: 'create',
    args: parseCreateArgs(argv)
  };
}

function validateName(name) {
  if (typeof name !== 'string') {
    return false;
  }

  const plain = /^[a-z0-9][a-z0-9._-]*$/;
  const scoped = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
  return plain.test(name) || scoped.test(name);
}

function packageDirFromName(packageName) {
  const parts = packageName.split('/');
  return parts[parts.length - 1];
}

function deriveScope(argsScope, packageName) {
  if (argsScope) {
    return argsScope;
  }

  if (typeof packageName === 'string' && packageName.startsWith('@')) {
    const first = packageName.split('/')[0];
    return first.slice(1);
  }

  return 'team';
}

function renderTemplateString(source, variables) {
  let output = source;

  for (const [key, value] of Object.entries(variables)) {
    output = output.replace(new RegExp(`__${key}__`, 'g'), value);
  }

  return output;
}

function copyDirRecursive(sourceDir, targetDir, variables, relativeBase = '') {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const createdFiles = [];

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);
    const relativePath = path.posix.join(relativeBase, entry.name);

    if (entry.isDirectory()) {
      createdFiles.push(...copyDirRecursive(srcPath, destPath, variables, relativePath));
      continue;
    }

    const source = fs.readFileSync(srcPath, 'utf8');
    const rendered = renderTemplateString(source, variables);
    fs.writeFileSync(destPath, rendered);
    createdFiles.push(relativePath);
  }

  return createdFiles;
}

function readJsonFile(filePath) {
  let raw;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createSummary() {
  return {
    createdFiles: [],
    overwrittenFiles: [],
    skippedFiles: [],
    updatedScriptKeys: [],
    skippedScriptKeys: [],
    removedScriptKeys: [],
    updatedDependencyKeys: [],
    skippedDependencyKeys: [],
    warnings: []
  };
}

function printSummary(title, summary) {
  const list = (values) => (values.length ? values.join(', ') : 'none');

  console.log(title);
  console.log(`files created: ${list(summary.createdFiles)}`);
  console.log(`files overwritten: ${list(summary.overwrittenFiles)}`);
  console.log(`files skipped: ${list(summary.skippedFiles)}`);
  console.log(`scripts updated: ${list(summary.updatedScriptKeys)}`);
  console.log(`scripts skipped: ${list(summary.skippedScriptKeys)}`);
  console.log(`scripts removed: ${list(summary.removedScriptKeys)}`);
  console.log(`dependencies updated: ${list(summary.updatedDependencyKeys)}`);
  console.log(`dependencies skipped: ${list(summary.skippedDependencyKeys)}`);
  console.log(`warnings: ${list(summary.warnings)}`);
}

function logStep(status, message) {
  const labels = {
    run: '[RUN ]',
    ok: '[OK  ]',
    warn: '[WARN]',
    err: '[ERR ]'
  };
  const prefix = labels[status] || '[INFO]';
  const writer = status === 'err' ? console.error : console.log;
  writer(`${prefix} ${message}`);
}

async function confirmOrThrow(questionText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Confirmation required but no interactive terminal was detected. Re-run with --yes if you want to proceed non-interactively.`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question(`${questionText}\nType "yes" to continue: `);
    if (answer.trim().toLowerCase() !== 'yes') {
      throw new Error('Operation cancelled by user.');
    }
  } finally {
    rl.close();
  }
}

function ensureFileFromTemplate(targetPath, templatePath, options) {
  const exists = fs.existsSync(targetPath);

  if (exists && !options.force) {
    return 'skipped';
  }

  const source = fs.readFileSync(templatePath, 'utf8');
  const rendered = renderTemplateString(source, options.variables);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, rendered);

  if (exists) {
    return 'overwritten';
  }

  return 'created';
}

function detectEquivalentManagedFile(packageDir, targetRelativePath) {
  if (targetRelativePath !== '.github/PULL_REQUEST_TEMPLATE.md') {
    return targetRelativePath;
  }

  const canonicalPath = path.join(packageDir, targetRelativePath);
  if (fs.existsSync(canonicalPath)) {
    return targetRelativePath;
  }

  const legacyLowercase = '.github/pull_request_template.md';
  if (fs.existsSync(path.join(packageDir, legacyLowercase))) {
    return legacyLowercase;
  }

  return targetRelativePath;
}

function updateManagedFiles(packageDir, templateDir, options, summary) {
  for (const [targetRelativePath, templateRelativePath] of MANAGED_FILE_SPECS) {
    const effectiveTargetRelative = detectEquivalentManagedFile(packageDir, targetRelativePath);
    const targetPath = path.join(packageDir, effectiveTargetRelative);
    const templatePath = path.join(templateDir, templateRelativePath);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const result = ensureFileFromTemplate(targetPath, templatePath, {
      force: options.force,
      variables: options.variables
    });

    if (result === 'created') {
      summary.createdFiles.push(targetRelativePath);
    } else if (result === 'overwritten') {
      summary.overwrittenFiles.push(targetRelativePath);
    } else {
      summary.skippedFiles.push(targetRelativePath);
    }
  }
}

function removeLegacyReleaseScripts(packageJson, summary) {
  const keys = Object.keys(packageJson.scripts || {});

  for (const key of keys) {
    const isLegacy = key === 'release:dist-tags'
      || key.startsWith('release:beta')
      || key.startsWith('release:stable')
      || key.startsWith('release:promote')
      || key.startsWith('release:rollback');

    if (!isLegacy) {
      continue;
    }

    delete packageJson.scripts[key];
    summary.removedScriptKeys.push(key);
  }
}

function configureExistingPackage(packageDir, templateDir, options) {
  if (!fs.existsSync(packageDir)) {
    throw new Error(`Directory not found: ${packageDir}`);
  }

  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${packageDir}`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  packageJson.scripts = packageJson.scripts || {};
  packageJson.devDependencies = packageJson.devDependencies || {};

  const summary = createSummary();

  const desiredScripts = {
    check: 'npm run test',
    changeset: 'changeset',
    'version-packages': 'changeset version',
    release: 'npm run check && changeset publish',
    'beta:enter': 'changeset pre enter beta',
    'beta:exit': 'changeset pre exit',
    'beta:version': 'changeset version',
    'beta:publish': 'changeset publish',
    'beta:promote': 'create-package-starter promote-stable --dir .'
  };

  let packageJsonChanged = false;

  for (const [key, value] of Object.entries(desiredScripts)) {
    const exists = Object.prototype.hasOwnProperty.call(packageJson.scripts, key);

    if (key === 'check') {
      if (!exists) {
        packageJson.scripts[key] = value;
        packageJsonChanged = true;
        summary.updatedScriptKeys.push(key);
      } else if (options.force && packageJson.scripts[key] !== value) {
        packageJson.scripts[key] = value;
        packageJsonChanged = true;
        summary.updatedScriptKeys.push(key);
      } else {
        summary.skippedScriptKeys.push(key);
      }
      continue;
    }

    if (!exists || options.force) {
      if (!exists || packageJson.scripts[key] !== value) {
        packageJson.scripts[key] = value;
        packageJsonChanged = true;
      }
      summary.updatedScriptKeys.push(key);
      continue;
    }

    summary.skippedScriptKeys.push(key);
  }

  const depExists = Object.prototype.hasOwnProperty.call(packageJson.devDependencies, CHANGESETS_DEP);

  if (!depExists || options.force) {
    if (!depExists || packageJson.devDependencies[CHANGESETS_DEP] !== CHANGESETS_DEP_VERSION) {
      packageJson.devDependencies[CHANGESETS_DEP] = CHANGESETS_DEP_VERSION;
      packageJsonChanged = true;
    }
    summary.updatedDependencyKeys.push(CHANGESETS_DEP);
  } else {
    summary.skippedDependencyKeys.push(CHANGESETS_DEP);
  }

  if (options.cleanupLegacyRelease) {
    const before = summary.removedScriptKeys.length;
    removeLegacyReleaseScripts(packageJson, summary);
    if (summary.removedScriptKeys.length > before) {
      packageJsonChanged = true;
    }
  }

  const packageName = packageJson.name || packageDirFromName(path.basename(packageDir));

  updateManagedFiles(packageDir, templateDir, {
    force: options.force,
    variables: {
      PACKAGE_NAME: packageName,
      DEFAULT_BRANCH: options.defaultBranch,
      BETA_BRANCH: options.betaBranch || 'release/beta',
      SCOPE: deriveScope(options.scope, packageName)
    }
  }, summary);

  if (packageJsonChanged) {
    writeJsonFile(packageJsonPath, packageJson);
  }

  return summary;
}

function createNewPackage(args) {
  if (!validateName(args.name)) {
    throw new Error('Provide a valid package name with --name (for example: hello-package or @i-santos/swarm).');
  }

  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template not found in ${templateDir}`);
  }

  const outputDir = path.resolve(args.out);
  const targetDir = path.join(outputDir, packageDirFromName(args.name));

  if (fs.existsSync(targetDir)) {
    throw new Error(`Directory already exists: ${targetDir}`);
  }

  const summary = createSummary();

  const createdFiles = copyDirRecursive(templateDir, targetDir, {
    PACKAGE_NAME: args.name,
    DEFAULT_BRANCH: args.defaultBranch,
    BETA_BRANCH: 'release/beta',
    SCOPE: deriveScope('', args.name)
  });

  summary.createdFiles.push(...createdFiles);

  summary.updatedScriptKeys.push('check', 'changeset', 'version-packages', 'release');
  summary.updatedScriptKeys.push('beta:enter', 'beta:exit', 'beta:version', 'beta:publish', 'beta:promote');
  summary.updatedDependencyKeys.push(CHANGESETS_DEP);

  printSummary(`Package created in ${targetDir}`, summary);
}

function initExistingPackage(args) {
  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const targetDir = path.resolve(args.dir);

  const summary = configureExistingPackage(targetDir, templateDir, args);
  printSummary(`Project initialized in ${targetDir}`, summary);
}

function execCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });
}

function parseRepoFromRemote(remoteUrl) {
  const trimmed = remoteUrl.trim();
  const httpsMatch = trimmed.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);

  if (httpsMatch) {
    return httpsMatch[1];
  }

  return '';
}

function resolveRepo(args, deps) {
  if (args.repo) {
    return args.repo;
  }

  const remote = deps.exec('git', ['config', '--get', 'remote.origin.url']);
  if (remote.status !== 0 || !remote.stdout.trim()) {
    throw new Error('Could not infer repository. Use --repo <owner/repo>.');
  }

  const repo = parseRepoFromRemote(remote.stdout);
  if (!repo) {
    throw new Error('Could not parse GitHub repository from remote.origin.url. Use --repo <owner/repo>.');
  }

  return repo;
}

function createBaseRulesetPayload(defaultBranch) {
  return {
    name: DEFAULT_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [`refs/heads/${defaultBranch}`],
        exclude: []
      }
    },
    bypass_actors: [],
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: true
        }
      }
    ]
  };
}

function createBetaRulesetPayload(betaBranch) {
  return {
    name: `Beta branch protection (${betaBranch})`,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [`refs/heads/${betaBranch}`],
        exclude: []
      }
    },
    bypass_actors: [],
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: true
        }
      }
    ]
  };
}

function createRulesetPayload(args) {
  if (!args.ruleset) {
    return createBaseRulesetPayload(args.defaultBranch);
  }

  const rulesetPath = path.resolve(args.ruleset);
  if (!fs.existsSync(rulesetPath)) {
    throw new Error(`Ruleset file not found: ${rulesetPath}`);
  }

  return readJsonFile(rulesetPath);
}

function ghApi(deps, method, endpoint, payload) {
  const args = ['api', '--method', method, endpoint];

  if (payload !== undefined) {
    args.push('--input', '-');
  }

  return deps.exec('gh', args, {
    input: payload !== undefined ? `${JSON.stringify(payload)}\n` : undefined
  });
}

function ensureGhAvailable(deps) {
  const version = deps.exec('gh', ['--version']);
  if (version.status !== 0) {
    throw new Error('GitHub CLI (gh) is required. Install it from https://cli.github.com/ and rerun.');
  }

  const auth = deps.exec('gh', ['auth', 'status']);
  if (auth.status !== 0) {
    throw new Error('GitHub CLI is not authenticated. Run "gh auth login" and rerun.');
  }
}

function parseJsonOutput(output, fallbackError) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(fallbackError);
  }
}

function upsertRuleset(deps, repo, rulesetPayload) {
  const listResult = ghApi(deps, 'GET', `/repos/${repo}/rulesets`);
  if (listResult.status !== 0) {
    throw new Error(`Failed to list rulesets: ${listResult.stderr || listResult.stdout}`.trim());
  }

  const rulesets = parseJsonOutput(listResult.stdout || '[]', 'Failed to parse rulesets response from GitHub API.');
  const existing = rulesets.find((ruleset) => ruleset.name === rulesetPayload.name);

  if (!existing) {
    const createResult = ghApi(deps, 'POST', `/repos/${repo}/rulesets`, rulesetPayload);
    if (createResult.status !== 0) {
      throw new Error(`Failed to create ruleset: ${createResult.stderr || createResult.stdout}`.trim());
    }

    return 'created';
  }

  const updateResult = ghApi(deps, 'PUT', `/repos/${repo}/rulesets/${existing.id}`, rulesetPayload);
  if (updateResult.status !== 0) {
    throw new Error(`Failed to update ruleset: ${updateResult.stderr || updateResult.stdout}`.trim());
  }

  return 'updated';
}

function updateWorkflowPermissions(deps, repo) {
  const workflowPermissionsPayload = {
    default_workflow_permissions: 'write',
    can_approve_pull_request_reviews: true
  };

  const result = ghApi(
    deps,
    'PUT',
    `/repos/${repo}/actions/permissions/workflow`,
    workflowPermissionsPayload
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to update workflow permissions: ${result.stderr || result.stdout}`.trim()
    );
  }
}

function isNotFoundResponse(result) {
  const output = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
  return output.includes('404') || output.includes('not found');
}

function ensureBranchExists(deps, repo, defaultBranch, targetBranch) {
  const encodedTarget = encodeURIComponent(targetBranch);
  const getTarget = ghApi(deps, 'GET', `/repos/${repo}/branches/${encodedTarget}`);
  if (getTarget.status === 0) {
    return 'exists';
  }

  if (!isNotFoundResponse(getTarget)) {
    throw new Error(`Failed to check branch "${targetBranch}": ${getTarget.stderr || getTarget.stdout}`.trim());
  }

  const encodedDefault = encodeURIComponent(defaultBranch);
  const getDefaultRef = ghApi(deps, 'GET', `/repos/${repo}/git/ref/heads/${encodedDefault}`);
  if (getDefaultRef.status !== 0) {
    throw new Error(`Failed to resolve default branch "${defaultBranch}": ${getDefaultRef.stderr || getDefaultRef.stdout}`.trim());
  }

  const parsed = parseJsonOutput(getDefaultRef.stdout || '{}', 'Failed to parse default branch ref from GitHub API.');
  const sha = parsed && parsed.object && parsed.object.sha;
  if (!sha) {
    throw new Error(`Could not determine SHA for default branch "${defaultBranch}".`);
  }

  const createRef = ghApi(deps, 'POST', `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${targetBranch}`,
    sha
  });
  if (createRef.status !== 0) {
    throw new Error(`Failed to create branch "${targetBranch}": ${createRef.stderr || createRef.stdout}`.trim());
  }

  return 'created';
}

function branchExists(deps, repo, targetBranch) {
  const encodedTarget = encodeURIComponent(targetBranch);
  const getTarget = ghApi(deps, 'GET', `/repos/${repo}/branches/${encodedTarget}`);
  if (getTarget.status === 0) {
    return true;
  }

  if (isNotFoundResponse(getTarget)) {
    return false;
  }

  throw new Error(`Failed to check branch "${targetBranch}": ${getTarget.stderr || getTarget.stdout}`.trim());
}

function findRulesetByName(deps, repo, name) {
  const listResult = ghApi(deps, 'GET', `/repos/${repo}/rulesets`);
  if (listResult.status !== 0) {
    throw new Error(`Failed to list rulesets: ${listResult.stderr || listResult.stdout}`.trim());
  }

  const rulesets = parseJsonOutput(listResult.stdout || '[]', 'Failed to parse rulesets response from GitHub API.');
  return rulesets.find((ruleset) => ruleset.name === name) || null;
}

function ensureNpmAvailable(deps) {
  const version = deps.exec('npm', ['--version']);
  if (version.status !== 0) {
    throw new Error('npm CLI is required. Install npm and rerun.');
  }
}

function ensureNpmAuthenticated(deps) {
  const whoami = deps.exec('npm', ['whoami']);
  if (whoami.status !== 0) {
    throw new Error('npm CLI is not authenticated. Run "npm login" and rerun.');
  }
}

function packageExistsOnNpm(deps, packageName) {
  const view = deps.exec('npm', ['view', packageName, 'version', '--json']);
  if (view.status === 0) {
    return true;
  }

  const output = `${view.stderr || ''}\n${view.stdout || ''}`.toLowerCase();
  if (output.includes('e404') || output.includes('not found') || output.includes('404')) {
    return false;
  }

  throw new Error(`Failed to check package on npm: ${view.stderr || view.stdout}`.trim());
}

function setupNpm(args, dependencies = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };

  const targetDir = path.resolve(args.dir);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${targetDir}`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  if (!packageJson.name) {
    throw new Error(`package.json in ${targetDir} must define "name".`);
  }

  ensureNpmAvailable(deps);
  ensureNpmAuthenticated(deps);

  const summary = createSummary();
  summary.updatedScriptKeys.push('npm.auth', 'npm.package.lookup');

  if (!packageJson.publishConfig || packageJson.publishConfig.access !== 'public') {
    summary.warnings.push('package.json publishConfig.access is not "public". First publish may fail for public packages.');
  }

  const existsOnNpm = packageExistsOnNpm(deps, packageJson.name);
  if (existsOnNpm) {
    summary.skippedScriptKeys.push('npm.first_publish');
  } else {
    summary.updatedScriptKeys.push('npm.first_publish_required');
  }

  if (!existsOnNpm && !args.publishFirst) {
    summary.warnings.push(`package "${packageJson.name}" was not found on npm. Run "create-package-starter setup-npm --dir ${targetDir} --publish-first" to perform first publish.`);
  }

  if (args.publishFirst) {
    if (existsOnNpm) {
      summary.warnings.push(`package "${packageJson.name}" already exists on npm. Skipping first publish.`);
    } else if (args.dryRun) {
      summary.warnings.push(`dry-run: would run "npm publish --access public" in ${targetDir}`);
    } else {
      const publish = deps.exec('npm', ['publish', '--access', 'public'], { cwd: targetDir, stdio: 'inherit' });
      if (publish.status !== 0) {
        const publishOutput = `${publish.stderr || ''}\n${publish.stdout || ''}`.toLowerCase();
        const isOtpError = publishOutput.includes('eotp') || publishOutput.includes('one-time password');

        if (isOtpError) {
          throw new Error(
            [
              'First publish failed due to npm 2FA/OTP requirements.',
              'This command already delegates to the standard npm publish flow.',
              'If npm still requires manual OTP entry, complete publish manually:',
              `  (cd ${targetDir} && npm publish --access public)`
            ].join('\n')
          );
        }

        throw new Error('First publish failed. Check npm output above and try again.');
      }
      summary.updatedScriptKeys.push('npm.first_publish_done');
    }
  }

  summary.warnings.push('Configure npm Trusted Publisher manually in npm package settings after first publish.');
  summary.warnings.push('Trusted Publisher requires owner, repository, workflow file (.github/workflows/release.yml), and branch (main by default).');

  printSummary(`npm setup completed for ${packageJson.name}`, summary);
}

async function setupBeta(args, dependencies = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };

  const targetDir = path.resolve(args.dir);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${targetDir}`);
  }

  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const packageJson = readJsonFile(packageJsonPath);
  packageJson.scripts = packageJson.scripts || {};

  logStep('run', 'Checking GitHub CLI availability and authentication...');
  try {
    ensureGhAvailable(deps);
    logStep('ok', 'GitHub CLI is available and authenticated.');
  } catch (error) {
    logStep('err', error.message);
    if (error.message.includes('not authenticated')) {
      logStep('warn', 'Run "gh auth login" and retry.');
    }
    throw error;
  }

  logStep('run', 'Resolving repository target...');
  const repo = resolveRepo(args, deps);
  logStep('ok', `Using repository ${repo}.`);

  const summary = createSummary();
  summary.updatedScriptKeys.push('github.beta_branch', 'github.beta_ruleset', 'actions.default_workflow_permissions');
  const desiredScripts = {
    'beta:enter': 'changeset pre enter beta',
    'beta:exit': 'changeset pre exit',
    'beta:version': 'changeset version',
    'beta:publish': 'changeset publish',
    'beta:promote': 'create-package-starter promote-stable --dir .'
  };

  let packageJsonChanged = false;
  for (const [key, value] of Object.entries(desiredScripts)) {
    const exists = Object.prototype.hasOwnProperty.call(packageJson.scripts, key);
    if (!exists || args.force) {
      if (!exists || packageJson.scripts[key] !== value) {
        packageJson.scripts[key] = value;
        packageJsonChanged = true;
      }
      summary.updatedScriptKeys.push(key);
    } else {
      summary.skippedScriptKeys.push(key);
    }
  }

  const workflowRelativePath = '.github/workflows/release.yml';
  const workflowTemplatePath = path.join(templateDir, workflowRelativePath);
  const workflowTargetPath = path.join(targetDir, workflowRelativePath);
  if (!fs.existsSync(workflowTemplatePath)) {
    throw new Error(`Template not found: ${workflowTemplatePath}`);
  }

  if (args.dryRun) {
    logStep('warn', 'Dry-run mode enabled. No remote or file changes will be applied.');
    if (!fs.existsSync(workflowTargetPath)) {
      summary.warnings.push(`dry-run: would create ${workflowRelativePath}`);
    } else if (args.force) {
      summary.warnings.push(`dry-run: would overwrite ${workflowRelativePath}`);
    } else {
      summary.warnings.push(`dry-run: would keep existing ${workflowRelativePath}`);
    }
    if (packageJsonChanged) {
      summary.warnings.push('dry-run: would update package.json beta scripts');
    }
    summary.warnings.push(`dry-run: would ensure branch "${args.betaBranch}" exists in ${repo}`);
    summary.warnings.push(`dry-run: would upsert ruleset for refs/heads/${args.betaBranch}`);
    summary.warnings.push(`dry-run: would set Actions workflow permissions to write for ${repo}`);
    summary.warnings.push(`dry-run: beta branch configured as ${args.betaBranch}`);
  } else {
    const betaRulesetPayload = createBetaRulesetPayload(args.betaBranch);
    const doesBranchExist = branchExists(deps, repo, args.betaBranch);
    const existingRuleset = findRulesetByName(deps, repo, betaRulesetPayload.name);

    if (args.yes) {
      logStep('warn', 'Confirmation prompts skipped due to --yes.');
    } else {
      await confirmOrThrow(
        [
          `This will modify GitHub repository settings for ${repo}:`,
          `- set Actions workflow permissions to write`,
          `- ensure branch "${args.betaBranch}" exists${doesBranchExist ? ' (already exists)' : ' (will be created)'}`,
          `- apply branch protection ruleset "${betaRulesetPayload.name}"`,
          `- update local ${workflowRelativePath} and package.json beta scripts`
        ].join('\n')
      );

      if (existingRuleset) {
        await confirmOrThrow(
          `Ruleset "${betaRulesetPayload.name}" already exists and will be overwritten.`
        );
      }
    }

    logStep('run', `Updating ${workflowRelativePath}...`);
    const workflowResult = ensureFileFromTemplate(workflowTargetPath, workflowTemplatePath, {
      force: args.force,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || '')
      }
    });

    if (workflowResult === 'created') {
      summary.createdFiles.push(workflowRelativePath);
      logStep('ok', `${workflowRelativePath} created.`);
    } else if (workflowResult === 'overwritten') {
      summary.overwrittenFiles.push(workflowRelativePath);
      logStep('ok', `${workflowRelativePath} overwritten.`);
    } else {
      summary.skippedFiles.push(workflowRelativePath);
      logStep('warn', `${workflowRelativePath} already exists; kept as-is.`);
    }

    if (packageJsonChanged) {
      logStep('run', 'Updating package.json beta scripts...');
      writeJsonFile(packageJsonPath, packageJson);
      logStep('ok', 'package.json beta scripts updated.');
    } else {
      logStep('warn', 'package.json beta scripts already present; no changes needed.');
    }

    logStep('run', 'Applying GitHub Actions workflow permissions...');
    updateWorkflowPermissions(deps, repo);
    logStep('ok', 'Workflow permissions configured.');

    logStep('run', `Ensuring branch "${args.betaBranch}" exists...`);
    const branchResult = ensureBranchExists(deps, repo, args.defaultBranch, args.betaBranch);
    if (branchResult === 'created') {
      summary.createdFiles.push(`github-branch:${args.betaBranch}`);
      logStep('ok', `Branch "${args.betaBranch}" created from "${args.defaultBranch}".`);
    } else {
      summary.skippedFiles.push(`github-branch:${args.betaBranch}`);
      logStep('warn', `Branch "${args.betaBranch}" already exists.`);
    }

    logStep('run', `Applying protection ruleset to "${args.betaBranch}"...`);
    const upsertResult = upsertRuleset(deps, repo, betaRulesetPayload);
    summary.overwrittenFiles.push(`github-beta-ruleset:${upsertResult}`);
    logStep('ok', `Beta branch ruleset ${upsertResult}.`);
  }

  summary.warnings.push(`Trusted Publisher supports a single workflow file per package. Keep publishing on .github/workflows/release.yml for both stable and beta.`);
  summary.warnings.push(`Next step: run "npm run beta:enter" once on "${args.betaBranch}", commit .changeset/pre.json, and push.`);
  printSummary(`beta setup completed for ${targetDir}`, summary);
}

function createChangesetFile(targetDir, packageName, bumpType, summaryText) {
  const changesetDir = path.join(targetDir, '.changeset');
  fs.mkdirSync(changesetDir, { recursive: true });
  const fileName = `promote-stable-${Date.now()}.md`;
  const filePath = path.join(changesetDir, fileName);
  const content = [
    '---',
    `"${packageName}": ${bumpType}`,
    '---',
    '',
    summaryText
  ].join('\n');
  fs.writeFileSync(filePath, `${content}\n`);
  return path.posix.join('.changeset', fileName);
}

function promoteStable(args, dependencies = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };

  const targetDir = path.resolve(args.dir);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${targetDir}`);
  }

  const prePath = path.join(targetDir, '.changeset', 'pre.json');
  if (!fs.existsSync(prePath)) {
    throw new Error(`No prerelease state found in ${targetDir}. Run "changeset pre enter beta" first.`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  if (!packageJson.name) {
    throw new Error(`package.json in ${targetDir} must define "name".`);
  }

  const summary = createSummary();
  summary.updatedScriptKeys.push('changeset.pre_exit', 'changeset.promote_stable');

  if (args.dryRun) {
    summary.warnings.push(`dry-run: would run "npx @changesets/cli pre exit" in ${targetDir}`);
    summary.warnings.push(`dry-run: would create promotion changeset for ${packageJson.name} (${args.type})`);
    summary.warnings.push(`dry-run: promote flow targets stable branch ${DEFAULT_BASE_BRANCH}`);
    printSummary(`stable promotion dry-run for ${targetDir}`, summary);
    return;
  }

  const preExit = deps.exec('npx', ['@changesets/cli', 'pre', 'exit'], { cwd: targetDir });
  if (preExit.status !== 0) {
    throw new Error(`Failed to exit prerelease mode: ${(preExit.stderr || preExit.stdout || '').trim()}`);
  }

  const createdChangeset = createChangesetFile(targetDir, packageJson.name, args.type, args.summary);
  summary.createdFiles.push(createdChangeset);
  summary.warnings.push('Next step: open PR from beta branch to main and merge to publish stable.');
  printSummary(`stable promotion prepared for ${targetDir}`, summary);
}

function setupGithub(args, dependencies = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };

  ensureGhAvailable(deps);

  const repo = resolveRepo(args, deps);
  const rulesetPayload = createRulesetPayload(args);
  const summary = createSummary();

  summary.updatedScriptKeys.push(
    'repository.default_branch',
    'repository.delete_branch_on_merge',
    'repository.allow_auto_merge',
    'repository.merge_policy',
    'actions.default_workflow_permissions'
  );

  if (args.dryRun) {
    summary.warnings.push(`dry-run: would update repository settings for ${repo}`);
    summary.warnings.push(`dry-run: would set actions workflow permissions to write for ${repo}`);
    summary.warnings.push(`dry-run: would upsert ruleset "${rulesetPayload.name}" for refs/heads/${args.defaultBranch}`);
    printSummary(`GitHub settings dry-run for ${repo}`, summary);
    return;
  }

  const repoPayload = {
    default_branch: args.defaultBranch,
    delete_branch_on_merge: true,
    allow_auto_merge: true,
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false
  };

  const patchRepo = ghApi(deps, 'PATCH', `/repos/${repo}`, repoPayload);
  if (patchRepo.status !== 0) {
    throw new Error(`Failed to update repository settings: ${patchRepo.stderr || patchRepo.stdout}`.trim());
  }

  updateWorkflowPermissions(deps, repo);

  const upsertResult = upsertRuleset(deps, repo, rulesetPayload);
  summary.overwrittenFiles.push(`github-ruleset:${upsertResult}`);

  printSummary(`GitHub settings applied to ${repo}`, summary);
}

async function run(argv, dependencies = {}) {
  const parsed = parseArgs(argv);

  if (parsed.args.help) {
    console.log(usage());
    return;
  }

  if (parsed.mode === 'init') {
    initExistingPackage(parsed.args);
    return;
  }

  if (parsed.mode === 'setup-github') {
    setupGithub(parsed.args, dependencies);
    return;
  }

  if (parsed.mode === 'setup-beta') {
    setupBeta(parsed.args, dependencies);
    return;
  }

  if (parsed.mode === 'promote-stable') {
    promoteStable(parsed.args, dependencies);
    return;
  }

  if (parsed.mode === 'setup-npm') {
    setupNpm(parsed.args, dependencies);
    return;
  }

  createNewPackage(parsed.args);
}

module.exports = {
  run,
  parseRepoFromRemote,
  createBaseRulesetPayload,
  createBetaRulesetPayload,
  setupGithub,
  setupNpm,
  setupBeta,
  promoteStable
};
