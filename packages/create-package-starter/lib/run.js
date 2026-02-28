const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');

const CHANGESETS_DEP = '@changesets/cli';
const CHANGESETS_DEP_VERSION = '^2.29.7';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_BETA_BRANCH = 'release/beta';
const DEFAULT_RULESET_NAME = 'Default main branch protection';
const REQUIRED_CHECK_CONTEXT = 'required-check';

const MANAGED_FILE_SPECS = [
  ['.changeset/config.json', '.changeset/config.json'],
  ['.changeset/README.md', '.changeset/README.md'],
  ['.github/workflows/ci.yml', '.github/workflows/ci.yml'],
  ['.github/workflows/release.yml', '.github/workflows/release.yml'],
  ['.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md'],
  ['.github/CODEOWNERS', '.github/CODEOWNERS'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
  ['README.md', 'README.md'],
  ['.gitignore', 'gitignore']
];

function usage() {
  return [
    'Usage:',
    '  create-package-starter --name <name> [--out <directory>] [--default-branch <branch>]',
    '  create-package-starter init [--dir <directory>] [--force] [--cleanup-legacy-release] [--scope <scope>] [--default-branch <branch>] [--with-github] [--with-npm] [--with-beta] [--repo <owner/repo>] [--beta-branch <branch>] [--ruleset <path>] [--dry-run] [--yes]',
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
    '  create-package-starter init --dir . --with-github --with-beta --with-npm --yes',
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
    betaBranch: DEFAULT_BETA_BRANCH,
    scope: '',
    repo: '',
    ruleset: '',
    withGithub: false,
    withNpm: false,
    withBeta: false,
    dryRun: false,
    yes: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
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

    if (token === '--beta-branch') {
      args.betaBranch = parseValueFlag(argv, i, '--beta-branch');
      i += 1;
      continue;
    }

    if (token === '--repo') {
      args.repo = parseValueFlag(argv, i, '--repo');
      i += 1;
      continue;
    }

    if (token === '--ruleset') {
      args.ruleset = parseValueFlag(argv, i, '--ruleset');
      i += 1;
      continue;
    }

    if (token === '--with-github') {
      args.withGithub = true;
      continue;
    }

    if (token === '--with-npm') {
      args.withNpm = true;
      continue;
    }

    if (token === '--with-beta') {
      args.withBeta = true;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--yes') {
      args.yes = true;
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
    betaBranch: DEFAULT_BETA_BRANCH,
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
    const destinationEntryName = relativeBase === '' && entry.name === 'gitignore'
      ? '.gitignore'
      : entry.name;
    const destPath = path.join(targetDir, destinationEntryName);
    const relativePath = path.posix.join(relativeBase, destinationEntryName);

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

class StepReporter {
  constructor() {
    this.active = null;
    this.frames = ['-', '\\', '|', '/'];
    this.frameIndex = 0;
  }

  canSpin() {
    return Boolean(process.stdout.isTTY) && process.env.CI !== 'true';
  }

  start(stepId, message) {
    this.stop();
    if (!this.canSpin()) {
      logStep('run', message);
      return;
    }

    this.active = {
      id: stepId,
      message,
      timer: setInterval(() => {
        const frame = this.frames[this.frameIndex % this.frames.length];
        this.frameIndex += 1;
        process.stdout.write(`\r${frame} ${message}`);
      }, 80)
    };
  }

  end(status, message) {
    if (this.active && this.active.timer) {
      clearInterval(this.active.timer);
      const finalLabel = status === 'ok'
        ? 'OK'
        : status === 'warn'
          ? 'WARN'
          : 'ERR';
      process.stdout.write(`\r[${finalLabel}] ${message}\n`);
      this.active = null;
      return;
    }

    logStep(status, message);
  }

  ok(stepId, message) {
    this.end('ok', message);
  }

  warn(stepId, message) {
    this.end('warn', message);
  }

  fail(stepId, message) {
    this.end('err', message);
  }

  stop() {
    if (!this.active || !this.active.timer) {
      return;
    }

    clearInterval(this.active.timer);
    process.stdout.write('\r');
    this.active = null;
  }
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

async function askYesNo(questionText, defaultValue = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultValue;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const suffix = defaultValue ? '[Y/n]' : '[y/N]';
    const answer = await rl.question(`${questionText} ${suffix} `);
    const normalized = answer.trim().toLowerCase();

    if (!normalized) {
      return defaultValue;
    }

    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

function mergeSummary(target, source) {
  target.createdFiles.push(...source.createdFiles);
  target.overwrittenFiles.push(...source.overwrittenFiles);
  target.skippedFiles.push(...source.skippedFiles);
  target.updatedScriptKeys.push(...source.updatedScriptKeys);
  target.skippedScriptKeys.push(...source.skippedScriptKeys);
  target.removedScriptKeys.push(...source.removedScriptKeys);
  target.updatedDependencyKeys.push(...source.updatedDependencyKeys);
  target.skippedDependencyKeys.push(...source.skippedDependencyKeys);
  target.warnings.push(...source.warnings);
}

function ensureFileFromTemplate(targetPath, templatePath, options) {
  const exists = fs.existsSync(targetPath);

  if (exists && !options.force) {
    return 'skipped';
  }

  if (options.dryRun) {
    return exists ? 'overwritten' : 'created';
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

function ensureReleaseWorkflowBranches(content, defaultBranch, betaBranch) {
  const lines = content.split('\n');
  const onIndex = lines.findIndex((line) => line.trim() === 'on:');

  if (onIndex < 0) {
    return null;
  }

  let onSectionEnd = lines.length;
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const isTopLevelKey = line && !line.startsWith(' ') && line.trim().endsWith(':');
    if (isTopLevelKey) {
      onSectionEnd = i;
      break;
    }
  }

  const onBlock = lines.slice(onIndex, onSectionEnd);
  const pushRelativeIndex = onBlock.findIndex((line) => line.trim() === 'push:');
  if (pushRelativeIndex < 0) {
    return null;
  }

  const branchesRelativeIndex = onBlock.findIndex((line) => line.trim() === 'branches:');
  if (branchesRelativeIndex < 0 || branchesRelativeIndex <= pushRelativeIndex) {
    return null;
  }

  const listStart = branchesRelativeIndex + 1;
  let listEnd = listStart;
  while (listEnd < onBlock.length && onBlock[listEnd].trim().startsWith('- ')) {
    listEnd += 1;
  }

  if (listEnd === listStart) {
    return null;
  }

  const existingBranches = onBlock.slice(listStart, listEnd)
    .map((line) => line.trim().replace(/^- /, '').trim())
    .filter(Boolean);

  const desiredBranches = [...new Set([defaultBranch, betaBranch])];
  const mergedBranches = [...existingBranches];
  for (const branch of desiredBranches) {
    if (!mergedBranches.includes(branch)) {
      mergedBranches.push(branch);
    }
  }

  const changed = mergedBranches.length !== existingBranches.length
    || mergedBranches.some((branch, index) => branch !== existingBranches[index]);

  if (!changed) {
    return {
      changed: false,
      content
    };
  }

  const updatedOnBlock = [
    ...onBlock.slice(0, listStart),
    ...mergedBranches.map((branch) => `      - ${branch}`),
    ...onBlock.slice(listEnd)
  ];

  const updatedLines = [
    ...lines.slice(0, onIndex),
    ...updatedOnBlock,
    ...lines.slice(onSectionEnd)
  ];

  return {
    changed: true,
    content: updatedLines.join('\n')
  };
}

function upsertReleaseWorkflow(targetPath, templatePath, options) {
  const exists = fs.existsSync(targetPath);
  if (!exists || options.force) {
    if (options.dryRun) {
      return {
        result: exists ? 'overwritten' : 'created'
      };
    }

    const result = ensureFileFromTemplate(targetPath, templatePath, {
      force: options.force,
      dryRun: options.dryRun,
      variables: options.variables
    });
    return { result };
  }

  const current = fs.readFileSync(targetPath, 'utf8');
  const ensured = ensureReleaseWorkflowBranches(
    current,
    options.variables.DEFAULT_BRANCH,
    options.variables.BETA_BRANCH
  );

  if (!ensured) {
    return {
      result: 'skipped',
      warning: `Could not safely update trigger branches in ${path.basename(targetPath)}. Use --force to overwrite from template.`
    };
  }

  if (!ensured.changed) {
    return { result: 'skipped' };
  }

  if (options.dryRun) {
    return { result: 'updated' };
  }

  fs.writeFileSync(targetPath, ensured.content);
  return { result: 'updated' };
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
    dryRun: options.dryRun,
    variables: {
      PACKAGE_NAME: packageName,
      DEFAULT_BRANCH: options.defaultBranch,
      BETA_BRANCH: options.betaBranch || DEFAULT_BETA_BRANCH,
      SCOPE: deriveScope(options.scope, packageName)
    }
  }, summary);

  if (packageJsonChanged && !options.dryRun) {
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
    BETA_BRANCH: DEFAULT_BETA_BRANCH,
    SCOPE: deriveScope('', args.name)
  });

  summary.createdFiles.push(...createdFiles);

  summary.updatedScriptKeys.push('check', 'changeset', 'version-packages', 'release');
  summary.updatedScriptKeys.push('beta:enter', 'beta:exit', 'beta:version', 'beta:publish', 'beta:promote');
  summary.updatedDependencyKeys.push(CHANGESETS_DEP);

  printSummary(`Package created in ${targetDir}`, summary);
}

async function initExistingPackage(args, dependencies = {}) {
  const reporter = new StepReporter();
  const selections = await resolveInitSelections(args);
  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const targetDir = path.resolve(args.dir);
  const overallSummary = createSummary();
  const deps = {
    exec: dependencies.exec || execCommand
  };

  if (!selections.withGithub && !selections.withNpm && !selections.withBeta && !process.stdin.isTTY) {
    overallSummary.warnings.push('No --with-* flags were provided in non-interactive mode. Only local init was applied.');
  }

  const context = prevalidateInitExecution(args, selections, dependencies, reporter);
  await confirmInitPlan(args, selections, context, overallSummary);

  reporter.start('local-init', 'Applying local package bootstrap...');
  const localSummary = configureExistingPackage(targetDir, templateDir, {
    ...args,
    dryRun: args.dryRun,
    betaBranch: args.betaBranch
  });
  mergeSummary(overallSummary, localSummary);
  reporter.ok('local-init', args.dryRun ? 'Local package bootstrap previewed.' : 'Local package bootstrap applied.');

  if (selections.withGithub && selections.withBeta) {
    ensureBetaWorkflowTriggers(
      targetDir,
      templateDir,
      {
        force: args.force,
        dryRun: args.dryRun,
        defaultBranch: args.defaultBranch,
        betaBranch: args.betaBranch,
        packageName: context.packageName,
        scope: deriveScope(args.scope, context.packageName)
      },
      overallSummary,
      reporter
    );
  }

  let repo = context.repo;
  if (selections.withGithub) {
    const githubSummary = createSummary();
    const mainResult = applyGithubMainSetup(
      {
        repo: context.repo,
        defaultBranch: args.defaultBranch,
        ruleset: args.ruleset,
        dryRun: args.dryRun
      },
      { exec: deps.exec },
      githubSummary,
      reporter
    );
    repo = mainResult.repo;

    if (selections.withBeta) {
      applyGithubBetaSetup(
        {
          betaBranch: args.betaBranch,
          defaultBranch: args.defaultBranch,
          dryRun: args.dryRun
        },
        { exec: deps.exec },
        githubSummary,
        reporter,
        repo
      );
    }

    mergeSummary(overallSummary, githubSummary);
  }

  if (selections.withNpm) {
    const npmSummary = runNpmSetup(
      {
        dir: targetDir,
        dryRun: args.dryRun,
        publishFirst: false
      },
      { exec: deps.exec },
      {
        reporter,
        publishMissingByDefault: true
      }
    );
    mergeSummary(overallSummary, npmSummary);
  }

  printSummary(`Project initialized in ${targetDir}`, overallSummary);
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
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            {
              context: REQUIRED_CHECK_CONTEXT
            }
          ]
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
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            {
              context: REQUIRED_CHECK_CONTEXT
            }
          ]
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

function listRulesets(deps, repo) {
  const listResult = ghApi(deps, 'GET', `/repos/${repo}/rulesets`);
  if (listResult.status !== 0) {
    throw new Error(`Failed to list rulesets: ${listResult.stderr || listResult.stdout}`.trim());
  }

  return parseJsonOutput(listResult.stdout || '[]', 'Failed to parse rulesets response from GitHub API.');
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

async function resolveInitSelections(args) {
  const explicit = args.withGithub || args.withNpm || args.withBeta;
  const selected = {
    withGithub: args.withGithub,
    withNpm: args.withNpm,
    withBeta: args.withBeta
  };

  if (!explicit) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      selected.withGithub = await askYesNo('Enable GitHub repository setup (rulesets/settings)?', false);
      selected.withNpm = await askYesNo('Enable npm setup (auth + package check + first publish if needed)?', false);
      selected.withBeta = selected.withGithub
        ? await askYesNo(`Enable beta flow setup using branch "${args.betaBranch}"?`, true)
        : false;
    } else {
      selected.withGithub = false;
      selected.withNpm = false;
      selected.withBeta = false;
    }
  }

  if (selected.withBeta) {
    selected.withGithub = true;
  }

  return selected;
}

function summarizePlannedInitActions(selections, args, context) {
  const lines = [
    'This init execution will apply:',
    '- local managed files/scripts/dependencies bootstrap'
  ];

  if (selections.withGithub) {
    lines.push(`- GitHub main settings/ruleset for ${context.repo}`);
  }
  if (selections.withBeta) {
    lines.push(`- beta branch flow for ${args.betaBranch} (create branch if missing + ruleset + workflow triggers)`);
  }
  if (selections.withNpm) {
    if (context.existsOnNpm) {
      lines.push(`- npm setup for ${context.packageName} (already published; no first publish)`);
    } else {
      lines.push(`- npm setup for ${context.packageName} (first publish will run automatically)`);
    }
  }

  return lines.join('\n');
}

function upsertCiWorkflow(targetPath, templatePath, options) {
  return upsertReleaseWorkflow(targetPath, templatePath, options);
}

function ensureBetaWorkflowTriggers(targetDir, templateDir, options, summary, reporter) {
  const workflowRelativePath = '.github/workflows/release.yml';
  const workflowTemplatePath = path.join(templateDir, workflowRelativePath);
  const workflowTargetPath = path.join(targetDir, workflowRelativePath);

  const ciWorkflowRelativePath = '.github/workflows/ci.yml';
  const ciWorkflowTemplatePath = path.join(templateDir, ciWorkflowRelativePath);
  const ciWorkflowTargetPath = path.join(targetDir, ciWorkflowRelativePath);

  const variables = {
    PACKAGE_NAME: options.packageName,
    DEFAULT_BRANCH: options.defaultBranch,
    BETA_BRANCH: options.betaBranch,
    SCOPE: options.scope
  };

  reporter.start('workflow-release', `Ensuring ${workflowRelativePath} includes stable+beta triggers...`);
  const workflowUpsert = upsertReleaseWorkflow(workflowTargetPath, workflowTemplatePath, {
    force: options.force,
    dryRun: options.dryRun,
    variables
  });

  if (workflowUpsert.result === 'created') {
    summary.createdFiles.push(workflowRelativePath);
    reporter.ok('workflow-release', `${workflowRelativePath} created.`);
  } else if (workflowUpsert.result === 'overwritten' || workflowUpsert.result === 'updated') {
    summary.overwrittenFiles.push(workflowRelativePath);
    reporter.ok('workflow-release', `${workflowRelativePath} updated.`);
  } else {
    summary.skippedFiles.push(workflowRelativePath);
    if (workflowUpsert.warning) {
      summary.warnings.push(workflowUpsert.warning);
      reporter.warn('workflow-release', workflowUpsert.warning);
    } else {
      reporter.warn('workflow-release', `${workflowRelativePath} already configured; kept as-is.`);
    }
  }

  reporter.start('workflow-ci', `Ensuring ${ciWorkflowRelativePath} includes stable+beta triggers...`);
  const ciWorkflowUpsert = upsertCiWorkflow(ciWorkflowTargetPath, ciWorkflowTemplatePath, {
    force: options.force,
    dryRun: options.dryRun,
    variables
  });

  if (ciWorkflowUpsert.result === 'created') {
    summary.createdFiles.push(ciWorkflowRelativePath);
    reporter.ok('workflow-ci', `${ciWorkflowRelativePath} created.`);
  } else if (ciWorkflowUpsert.result === 'overwritten' || ciWorkflowUpsert.result === 'updated') {
    summary.overwrittenFiles.push(ciWorkflowRelativePath);
    reporter.ok('workflow-ci', `${ciWorkflowRelativePath} updated.`);
  } else {
    summary.skippedFiles.push(ciWorkflowRelativePath);
    if (ciWorkflowUpsert.warning) {
      summary.warnings.push(ciWorkflowUpsert.warning);
      reporter.warn('workflow-ci', ciWorkflowUpsert.warning);
    } else {
      reporter.warn('workflow-ci', `${ciWorkflowRelativePath} already configured; kept as-is.`);
    }
  }
}

function prevalidateInitExecution(args, selections, dependencies = {}, reporter = new StepReporter()) {
  const deps = {
    exec: dependencies.exec || execCommand
  };

  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const targetDir = path.resolve(args.dir);
  const packageJsonPath = path.join(targetDir, 'package.json');
  const result = {
    deps,
    targetDir,
    templateDir,
    packageJsonPath,
    repo: '',
    packageName: '',
    existsOnNpm: true,
    betaBranchExists: false,
    existingMainRuleset: null,
    existingBetaRuleset: null,
    mainRulesetPayload: null,
    betaRulesetPayload: createBetaRulesetPayload(args.betaBranch)
  };

  reporter.start('validate-local', 'Validating local project and templates...');
  if (!fs.existsSync(targetDir)) {
    reporter.fail('validate-local', `Directory not found: ${targetDir}`);
    throw new Error(`Directory not found: ${targetDir}`);
  }

  if (!fs.existsSync(packageJsonPath)) {
    reporter.fail('validate-local', `package.json not found in ${targetDir}`);
    throw new Error(`package.json not found in ${targetDir}`);
  }

  if (!fs.existsSync(templateDir)) {
    reporter.fail('validate-local', `Template not found in ${templateDir}`);
    throw new Error(`Template not found in ${templateDir}`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  result.packageName = packageJson.name || packageDirFromName(path.basename(targetDir));
  reporter.ok('validate-local', 'Local project validation complete.');

  if (selections.withGithub) {
    reporter.start('validate-gh', 'Validating GitHub CLI and authentication...');
    ensureGhAvailable(deps);
    reporter.ok('validate-gh', 'GitHub CLI available and authenticated.');

    reporter.start('resolve-repo', 'Resolving repository target...');
    result.repo = resolveRepo({ repo: args.repo }, deps);
    reporter.ok('resolve-repo', `Using repository ${result.repo}.`);

    reporter.start('validate-main-branch', `Checking default branch "${args.defaultBranch}"...`);
    if (!branchExists(deps, result.repo, args.defaultBranch)) {
      reporter.fail('validate-main-branch', `Default branch "${args.defaultBranch}" was not found in ${result.repo}.`);
      throw new Error(`Default branch "${args.defaultBranch}" not found in ${result.repo}.`);
    }
    reporter.ok('validate-main-branch', `Default branch "${args.defaultBranch}" found.`);

    reporter.start('validate-rulesets', 'Loading existing GitHub rulesets...');
    const rulesets = listRulesets(deps, result.repo);
    result.mainRulesetPayload = createRulesetPayload(args);
    result.existingMainRuleset = rulesets.find((item) => item.name === result.mainRulesetPayload.name) || null;
    if (selections.withBeta) {
      result.existingBetaRuleset = rulesets.find((item) => item.name === result.betaRulesetPayload.name) || null;
    }
    reporter.ok('validate-rulesets', 'Ruleset scan completed.');

    if (selections.withBeta) {
      reporter.start('validate-beta-branch', `Checking beta branch "${args.betaBranch}"...`);
      result.betaBranchExists = branchExists(deps, result.repo, args.betaBranch);
      reporter.ok(
        'validate-beta-branch',
        result.betaBranchExists
          ? `Beta branch "${args.betaBranch}" already exists.`
          : `Beta branch "${args.betaBranch}" will be created from "${args.defaultBranch}".`
      );
    }
  }

  if (selections.withNpm) {
    reporter.start('validate-npm', 'Validating npm CLI and authentication...');
    ensureNpmAvailable(deps);
    ensureNpmAuthenticated(deps);
    reporter.ok('validate-npm', 'npm CLI available and authenticated.');

    reporter.start('validate-package-publish', `Checking npm package status for ${result.packageName}...`);
    result.existsOnNpm = packageExistsOnNpm(deps, result.packageName);
    reporter.ok(
      'validate-package-publish',
      result.existsOnNpm
        ? `Package ${result.packageName} already exists on npm.`
        : `Package ${result.packageName} does not exist on npm; first publish will run.`
    );
  }

  return result;
}

async function confirmInitPlan(args, selections, context, summary) {
  const hasExternalActions = selections.withGithub || selections.withNpm || selections.withBeta;
  const needsLocalForceConfirm = false;

  if (!hasExternalActions && !needsLocalForceConfirm) {
    return;
  }

  if (args.yes) {
    summary.warnings.push('Confirmation prompts skipped due to --yes.');
    return;
  }

  await confirmOrThrow(summarizePlannedInitActions(selections, args, context));

  if (args.force) {
    await confirmOrThrow('--force will overwrite managed files/scripts/dependencies when applicable.');
  }

  if (selections.withGithub && context.existingMainRuleset) {
    await confirmOrThrow(`Ruleset "${context.mainRulesetPayload.name}" already exists and will be overwritten.`);
  }

  if (selections.withBeta && context.betaBranchExists) {
    await confirmOrThrow(`Branch "${args.betaBranch}" already exists and will be used as beta release flow branch.`);
  }

  if (selections.withBeta && context.existingBetaRuleset) {
    await confirmOrThrow(`Ruleset "${context.betaRulesetPayload.name}" already exists and will be overwritten.`);
  }
}

function runNpmSetup(args, dependencies = {}, options = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };
  const reporter = options.reporter || new StepReporter();
  const summary = options.summary || createSummary();

  const targetDir = path.resolve(args.dir);
  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const publishMissingByDefault = Boolean(options.publishMissingByDefault);
  const shouldPublishFirst = args.publishFirst || publishMissingByDefault;

  reporter.start('npm-auth', 'Checking npm authentication...');
  ensureNpmAvailable(deps);
  ensureNpmAuthenticated(deps);
  reporter.ok('npm-auth', 'npm authentication validated.');

  summary.updatedScriptKeys.push('npm.auth', 'npm.package.lookup');

  if (!packageJson.publishConfig || packageJson.publishConfig.access !== 'public') {
    summary.warnings.push('package.json publishConfig.access is not "public". First publish may fail for public packages.');
  }

  reporter.start('npm-exists', `Checking whether ${packageJson.name} exists on npm...`);
  const existsOnNpm = packageExistsOnNpm(deps, packageJson.name);
  reporter.ok(
    'npm-exists',
    existsOnNpm
      ? `Package ${packageJson.name} already exists on npm.`
      : `Package ${packageJson.name} is not published on npm yet.`
  );

  if (existsOnNpm) {
    summary.skippedScriptKeys.push('npm.first_publish');
    summary.warnings.push(`Package "${packageJson.name}" already exists. First publish is not required.`);
  } else {
    summary.updatedScriptKeys.push('npm.first_publish_required');
  }

  if (!existsOnNpm && !shouldPublishFirst) {
    summary.warnings.push(`package "${packageJson.name}" was not found on npm. Run "create-package-starter setup-npm --dir ${targetDir} --publish-first" to perform first publish.`);
  }

  if (!existsOnNpm && shouldPublishFirst) {
    if (args.dryRun) {
      summary.warnings.push(`dry-run: would run "npm publish --access public" in ${targetDir}`);
    } else {
      reporter.start('npm-publish', `Publishing first version of ${packageJson.name}...`);
      const publish = deps.exec('npm', ['publish', '--access', 'public'], { cwd: targetDir, stdio: 'inherit' });
      if (publish.status !== 0) {
        reporter.fail('npm-publish', 'First publish failed.');
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

      reporter.ok('npm-publish', `First publish for ${packageJson.name} completed.`);
      summary.updatedScriptKeys.push('npm.first_publish_done');
    }
  }

  summary.warnings.push('Configure npm Trusted Publisher manually in npm package settings after first publish.');
  summary.warnings.push('Trusted Publisher requires owner, repository, workflow file (.github/workflows/release.yml), and branch (main by default).');

  return summary;
}

function setupNpm(args, dependencies = {}) {
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

  const summary = runNpmSetup(args, dependencies, {
    reporter: new StepReporter(),
    publishMissingByDefault: false
  });
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
  const ciWorkflowRelativePath = '.github/workflows/ci.yml';
  const ciWorkflowTemplatePath = path.join(templateDir, ciWorkflowRelativePath);
  const ciWorkflowTargetPath = path.join(targetDir, ciWorkflowRelativePath);
  if (!fs.existsSync(workflowTemplatePath)) {
    throw new Error(`Template not found: ${workflowTemplatePath}`);
  }
  if (!fs.existsSync(ciWorkflowTemplatePath)) {
    throw new Error(`Template not found: ${ciWorkflowTemplatePath}`);
  }

  if (args.dryRun) {
    logStep('warn', 'Dry-run mode enabled. No remote or file changes will be applied.');
    const workflowPreview = upsertReleaseWorkflow(workflowTargetPath, workflowTemplatePath, {
      force: args.force,
      dryRun: true,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || '')
      }
    });
    if (workflowPreview.result === 'created') {
      summary.warnings.push(`dry-run: would create ${workflowRelativePath}`);
    } else if (workflowPreview.result === 'overwritten') {
      summary.warnings.push(`dry-run: would overwrite ${workflowRelativePath}`);
    } else if (workflowPreview.result === 'updated') {
      summary.warnings.push(`dry-run: would update ${workflowRelativePath} trigger branches`);
    } else {
      summary.warnings.push(`dry-run: would keep existing ${workflowRelativePath}`);
      if (workflowPreview.warning) {
        summary.warnings.push(`dry-run: ${workflowPreview.warning}`);
      }
    }
    const ciWorkflowPreview = upsertReleaseWorkflow(ciWorkflowTargetPath, ciWorkflowTemplatePath, {
      force: args.force,
      dryRun: true,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || '')
      }
    });
    if (ciWorkflowPreview.result === 'created') {
      summary.warnings.push(`dry-run: would create ${ciWorkflowRelativePath}`);
    } else if (ciWorkflowPreview.result === 'overwritten') {
      summary.warnings.push(`dry-run: would overwrite ${ciWorkflowRelativePath}`);
    } else if (ciWorkflowPreview.result === 'updated') {
      summary.warnings.push(`dry-run: would update ${ciWorkflowRelativePath} trigger branches`);
    } else {
      summary.warnings.push(`dry-run: would keep existing ${ciWorkflowRelativePath}`);
      if (ciWorkflowPreview.warning) {
        summary.warnings.push(`dry-run: ${ciWorkflowPreview.warning}`);
      }
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
        `- require CI status check "${REQUIRED_CHECK_CONTEXT}" on beta branch`,
          `- update local ${workflowRelativePath} and package.json beta scripts`
        ].join('\n')
      );

      if (existingRuleset) {
        await confirmOrThrow(
          `Ruleset "${betaRulesetPayload.name}" already exists and will be overwritten.`
        );
      }
    }

    logStep('run', `Ensuring ${workflowRelativePath} includes stable+beta triggers...`);
    const workflowUpsert = upsertReleaseWorkflow(workflowTargetPath, workflowTemplatePath, {
      force: args.force,
      dryRun: false,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || '')
      }
    });
    const workflowResult = workflowUpsert.result;

    if (workflowResult === 'created') {
      summary.createdFiles.push(workflowRelativePath);
      logStep('ok', `${workflowRelativePath} created.`);
    } else if (workflowResult === 'overwritten') {
      summary.overwrittenFiles.push(workflowRelativePath);
      logStep('ok', `${workflowRelativePath} overwritten.`);
    } else if (workflowResult === 'updated') {
      summary.overwrittenFiles.push(workflowRelativePath);
      logStep('ok', `${workflowRelativePath} updated with missing branch triggers.`);
    } else {
      summary.skippedFiles.push(workflowRelativePath);
      if (workflowUpsert.warning) {
        summary.warnings.push(workflowUpsert.warning);
        logStep('warn', workflowUpsert.warning);
      } else {
        logStep('warn', `${workflowRelativePath} already configured; kept as-is.`);
      }
    }

    logStep('run', `Ensuring ${ciWorkflowRelativePath} includes stable+beta triggers...`);
    const ciWorkflowUpsert = upsertReleaseWorkflow(ciWorkflowTargetPath, ciWorkflowTemplatePath, {
      force: args.force,
      dryRun: false,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || '')
      }
    });
    const ciWorkflowResult = ciWorkflowUpsert.result;
    if (ciWorkflowResult === 'created') {
      summary.createdFiles.push(ciWorkflowRelativePath);
      logStep('ok', `${ciWorkflowRelativePath} created.`);
    } else if (ciWorkflowResult === 'overwritten') {
      summary.overwrittenFiles.push(ciWorkflowRelativePath);
      logStep('ok', `${ciWorkflowRelativePath} overwritten.`);
    } else if (ciWorkflowResult === 'updated') {
      summary.overwrittenFiles.push(ciWorkflowRelativePath);
      logStep('ok', `${ciWorkflowRelativePath} updated with missing branch triggers.`);
    } else {
      summary.skippedFiles.push(ciWorkflowRelativePath);
      if (ciWorkflowUpsert.warning) {
        summary.warnings.push(ciWorkflowUpsert.warning);
        logStep('warn', ciWorkflowUpsert.warning);
      } else {
        logStep('warn', `${ciWorkflowRelativePath} already configured; kept as-is.`);
      }
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

function applyGithubMainSetup(args, dependencies, summary, reporter) {
  const deps = {
    exec: dependencies.exec || execCommand
  };
  const repo = resolveRepo(args, deps);
  const rulesetPayload = createRulesetPayload(args);

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
    return { repo, rulesetPayload };
  }

  reporter.start('github-main-settings', 'Applying GitHub repository settings...');
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
    reporter.fail('github-main-settings', 'Failed to update repository settings.');
    throw new Error(`Failed to update repository settings: ${patchRepo.stderr || patchRepo.stdout}`.trim());
  }
  reporter.ok('github-main-settings', 'Repository settings updated.');

  reporter.start('github-workflow-permissions', 'Applying GitHub Actions workflow permissions...');
  updateWorkflowPermissions(deps, repo);
  reporter.ok('github-workflow-permissions', 'Workflow permissions configured.');

  reporter.start('github-main-ruleset', `Applying ruleset "${rulesetPayload.name}"...`);
  const upsertResult = upsertRuleset(deps, repo, rulesetPayload);
  reporter.ok('github-main-ruleset', `Ruleset ${upsertResult}.`);
  summary.overwrittenFiles.push(`github-ruleset:${upsertResult}`);
  return { repo, rulesetPayload };
}

function applyGithubBetaSetup(args, dependencies, summary, reporter, repo) {
  const deps = {
    exec: dependencies.exec || execCommand
  };
  const betaRulesetPayload = createBetaRulesetPayload(args.betaBranch);

  summary.updatedScriptKeys.push('github.beta_branch', 'github.beta_ruleset');

  if (args.dryRun) {
    summary.warnings.push(`dry-run: would ensure branch "${args.betaBranch}" exists in ${repo}`);
    summary.warnings.push(`dry-run: would upsert ruleset "${betaRulesetPayload.name}" for refs/heads/${args.betaBranch}`);
    return;
  }

  reporter.start('github-beta-branch', `Ensuring branch "${args.betaBranch}" exists...`);
  const branchResult = ensureBranchExists(deps, repo, args.defaultBranch, args.betaBranch);
  if (branchResult === 'created') {
    summary.createdFiles.push(`github-branch:${args.betaBranch}`);
    reporter.ok('github-beta-branch', `Branch "${args.betaBranch}" created.`);
  } else {
    summary.skippedFiles.push(`github-branch:${args.betaBranch}`);
    reporter.warn('github-beta-branch', `Branch "${args.betaBranch}" already exists.`);
  }

  reporter.start('github-beta-ruleset', `Applying beta ruleset "${betaRulesetPayload.name}"...`);
  const upsertResult = upsertRuleset(deps, repo, betaRulesetPayload);
  summary.overwrittenFiles.push(`github-beta-ruleset:${upsertResult}`);
  reporter.ok('github-beta-ruleset', `Beta ruleset ${upsertResult}.`);
}

function setupGithub(args, dependencies = {}) {
  const summary = createSummary();
  const deps = {
    exec: dependencies.exec || execCommand
  };
  ensureGhAvailable(deps);

  const reporter = new StepReporter();
  const { repo } = applyGithubMainSetup(args, dependencies, summary, reporter);
  printSummary(args.dryRun ? `GitHub settings dry-run for ${repo}` : `GitHub settings applied to ${repo}`, summary);
}

async function run(argv, dependencies = {}) {
  const parsed = parseArgs(argv);

  if (parsed.args.help) {
    console.log(usage());
    return;
  }

  if (parsed.mode === 'init') {
    await initExistingPackage(parsed.args, dependencies);
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
