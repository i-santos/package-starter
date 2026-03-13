const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');
const { npmAdapter } = require('./adapters/npm');
const { firebaseAdapter } = require('./adapters/firebase');
const { validateAdapterForCapability, validateAdapterShape } = require('./adapters/types');
const {
  attachTaskRecord,
  createTaskRecord,
  readTaskRecord,
  transitionTask
} = require('@i-santos/workflow');

const CHANGESETS_DEP = '@changesets/cli';
const CHANGESETS_DEP_VERSION = '^2.29.7';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_BETA_BRANCH = 'release/beta';
const DEFAULT_PROMOTE_WORKFLOW = 'promote-stable.yml';
const DEFAULT_RULESET_NAME = 'Default main branch protection';
const DEFAULT_FIREBASE_BASE_BRANCH = 'develop';
const DEFAULT_FIREBASE_PRODUCTION_BRANCH = 'main';
const REQUIRED_CHECK_CONTEXT = 'required-check';
const DEFAULT_RELEASE_AUTH = 'pat';
const RELEASE_AUTH_MODES = new Set(['github-token', 'pat', 'app', 'manual-trigger']);
const RELEASE_AUTH_APP_REQUIRED_SECRETS = ['GH_APP_PRIVATE_KEY'];
const RELEASE_AUTH_APP_ID_SECRETS = ['GH_APP_CLIENT_ID', 'GH_APP_ID'];
const RELEASE_AUTH_DOC_LINKS = {
  overview: 'https://docs.github.com/apps',
  create: 'https://docs.github.com/apps/creating-github-apps/registering-a-github-app/registering-a-github-app',
  install: 'https://docs.github.com/apps/using-github-apps/installing-your-own-github-app',
  secrets: 'https://docs.github.com/actions/security-guides/using-secrets-in-github-actions',
  internal: 'https://github.com/i-santos/navy/blob/main/docs/release-auth-github-app.md'
};
const BEHIND_WITHOUT_TRIGGER_GRACE_MS = 15 * 1000;
const RECENT_BASE_MERGE_GRACE_MS = 90 * 1000;

const MANAGED_FILE_SPECS = [
  ['.changeset/config.json', '.changeset/config.json'],
  ['.changeset/README.md', '.changeset/README.md'],
  ['.github/workflows/ci.yml', '.github/workflows/ci.yml'],
  ['.github/workflows/release.yml', '.github/workflows/release.yml'],
  ['.github/workflows/promote-stable.yml', '.github/workflows/promote-stable.yml'],
  ['.github/workflows/auto-retarget-pr.yml', '.github/workflows/auto-retarget-pr.yml'],
  ['.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md'],
  ['.github/CODEOWNERS', '.github/CODEOWNERS'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
  ['README.md', 'README.md'],
  ['.gitignore', 'gitignore']
];
const INIT_CREATE_ONLY_FILES = new Set(['README.md', 'CONTRIBUTING.md']);
const COMPLETION_SHELLS = new Set(['bash', 'zsh', 'fish']);

const COMMAND_COMPLETION_SPEC = {
  create: {
    options: ['--name', '--out', '--default-branch', '--release-auth', '--help', '-h'],
    values: {
      '--release-auth': ['github-token', 'pat', 'app', 'manual-trigger']
    }
  },
  init: {
    options: ['--dir', '--adapter', '--force', '--cleanup-legacy-release', '--scope', '--default-branch', '--with-github', '--with-npm', '--with-beta', '--repo', '--beta-branch', '--ruleset', '--release-auth', '--dry-run', '--yes', '--help', '-h'],
    values: {
      '--adapter': ['npm', 'firebase'],
      '--release-auth': ['github-token', 'pat', 'app', 'manual-trigger']
    }
  },
  'setup-github': {
    options: ['--dir', '--adapter', '--repo', '--default-branch', '--base-branch', '--production-branch', '--beta-branch', '--ruleset', '--release-auth', '--force', '--dry-run', '--yes', '--help', '-h'],
    values: {
      '--adapter': ['npm', 'firebase'],
      '--release-auth': ['github-token', 'pat', 'app', 'manual-trigger']
    }
  },
  'setup-npm': {
    options: ['--dir', '--publish-first', '--dry-run', '--help', '-h'],
    values: {}
  },
  'setup-beta': {
    options: ['--dir', '--repo', '--default-branch', '--beta-branch', '--ruleset', '--release-auth', '--force', '--dry-run', '--yes', '--help', '-h'],
    values: {
      '--release-auth': ['github-token', 'pat', 'app', 'manual-trigger']
    }
  },
  release: {
    options: ['--repo', '--target', '--targets', '--mode', '--phase', '--track', '--promote-stable', '--promote-type', '--promote-summary', '--head', '--base', '--title', '--task-id', '--pr-description', '--body', '--pr-description-file', '--body-file', '--npm-package', '--update-pr-description', '--draft', '--auto-merge', '--watch-checks', '--check-timeout', '--confirm-merges', '--merge-when-green', '--merge-method', '--wait-release-pr', '--release-pr-timeout', '--merge-release-pr', '--verify-npm', '--confirm-cleanup', '--cleanup', '--sync-base', '--no-resume', '--no-cleanup', '--yes', '--dry-run', '--help', '-h'],
    values: {
      '--target': ['npm', 'firebase'],
      '--targets': ['single', 'auto'],
      '--mode': ['auto', 'code', 'publish'],
      '--phase': ['code', 'full'],
      '--track': ['auto', 'beta', 'stable'],
      '--promote-type': ['patch', 'minor', 'major'],
      '--merge-method': ['squash', 'merge', 'rebase'],
      '--sync-base': ['auto', 'rebase', 'merge', 'off']
    }
  },
  'promote-stable': {
    options: ['--dir', '--type', '--summary', '--help', '-h'],
    values: {
      '--type': ['patch', 'minor', 'major']
    }
  },
  config: {
    options: ['defaults', '--scope', '--auto-merge', '--watch-checks', '--check-timeout', '--confirm-merges', '--sync-base', '--resume', '--merge-when-green', '--merge-method', '--wait-release-pr', '--release-pr-timeout', '--merge-release-pr', '--verify-npm', '--confirm-cleanup', '--cleanup', '--json', '--dry-run', '--help', '-h'],
    values: {
      '--scope': ['global', 'project', 'local'],
      '--auto-merge': ['true', 'false'],
      '--watch-checks': ['true', 'false'],
      '--confirm-merges': ['true', 'false'],
      '--sync-base': ['auto', 'rebase', 'merge', 'off'],
      '--resume': ['true', 'false'],
      '--merge-when-green': ['true', 'false'],
      '--merge-method': ['squash', 'merge', 'rebase'],
      '--wait-release-pr': ['true', 'false'],
      '--merge-release-pr': ['true', 'false'],
      '--verify-npm': ['true', 'false'],
      '--confirm-cleanup': ['true', 'false'],
      '--cleanup': ['true', 'false']
    }
  },
  task: {
    options: ['new', 'plan', 'tdd', 'implement', 'verify', 'publish-ready', 'status', 'doctor', '--id', '--type', '--title', '--branch', '--dir', '--json', '--yes', '--dry-run', '--help', '-h'],
    values: {
      '--type': ['feature', 'fix', 'chore', 'refactor', 'test']
    }
  },
  completion: {
    options: ['--help', '-h'],
    values: {}
  }
};

const ROOT_COMMANDS = ['init', 'setup-github', 'setup-npm', 'setup-beta', 'release', 'promote-stable', 'config', 'task', 'completion'];
const ROOT_OPTIONS = ['--help', '-h', '--version', '-v', '--name', '--out', '--default-branch', '--release-auth'];

function usage() {
  return [
    'ship CLI',
    '',
    'Usage:',
    '  ship <command> [options]',
    '',
    'Core Commands:',
    '  ship --version',
    '  ship --name <name> [--out <directory>] [--default-branch <branch>]',
    '    Create a new package from template.',
    '',
    '  ship init [--dir <directory>] [--adapter <npm|firebase>] [--repo <owner/repo>] [--with-github] [--with-beta] [--with-npm] [--yes]',
    '    Bootstrap an existing package with ship standards.',
    '',
    '  ship setup-github [--dir <directory>] [--adapter <npm|firebase>] [--repo <owner/repo>] [--default-branch <branch>] [--beta-branch <branch>] [--yes]',
    '    Configure GitHub repository defaults, rulesets, and beta flow.',
    '',
    '  ship setup-npm [--dir <directory>] [--publish-first] [--dry-run]',
    '    Check npm auth/package status and optionally run first publish.',
    '',
    '  ship release [--repo <owner/repo>] [--target <adapter>] [--targets single|auto] [--mode auto|code|publish] [--phase code|full]',
    '               [--track auto|beta|stable] [--cleanup|--no-cleanup] [--promote-stable] [--yes] [--dry-run]',
    '    Orchestrate end-to-end release flow (PRs, checks, merge, npm validation).',
    '',
    '  ship task status --id <taskId> [--json]',
    '  ship task doctor [--json] [--dry-run]',
    '    Deprecated compatibility layer. Use admiral for task creation and lifecycle.',
    '',
    '  ship completion <bash|zsh|fish>',
    '    Print shell completion script for ship.',
    '',
    '  ship promote-stable [--dir <directory>] [--type patch|minor|major] [--summary <text>]',
    '    Create stable promotion changeset locally.',
    '',
    '  ship config defaults [--scope <global|project|local>] [--cleanup <true|false>] [--merge-method <method>] [--json] [--dry-run]',
    '    Read or update default release behavior at user or repository scope.',
    '',
    'Tip:',
    '  Use --dry-run first on mutating commands, then run with --yes.',
    '  Full command/API guide: docs/ship-api.md',
    '',
    'Examples:',
    '  ship --name hello-package',
    '  ship init --dir .',
    '  ship init --dir . --with-github --with-beta --with-npm --yes',
    '  ship release --phase code --auto-merge --merge-method merge --watch-checks',
    '  ship release --yes',
    '  ship release --targets auto --yes',
    '  ship task status --id tsk_20260303_001 --json',
    '  ship release --promote-stable --promote-type minor --yes',
    '  ship completion zsh',
    '  ship promote-stable --dir . --type patch --summary "Promote beta to stable"',
    '  ship config defaults --scope local --cleanup false --watch-checks false',
    '  ship setup-npm --dir . --publish-first',
    '  ship setup-github --dir . --beta-branch release/beta --release-auth app',
    '  ship setup-github --adapter firebase --dir . --repo owner/repo --base-branch develop --production-branch main --yes'
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
    defaultBranch: DEFAULT_BASE_BRANCH,
    releaseAuth: DEFAULT_RELEASE_AUTH,
    releaseAuthProvided: false
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

    if (token === '--release-auth') {
      args.releaseAuth = parseValueFlag(argv, i, '--release-auth');
      args.releaseAuthProvided = true;
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
    adapter: 'npm',
    force: false,
    cleanupLegacyRelease: false,
    defaultBranch: DEFAULT_BASE_BRANCH,
    betaBranch: DEFAULT_BETA_BRANCH,
    scope: '',
    repo: '',
    ruleset: '',
    releaseAuth: DEFAULT_RELEASE_AUTH,
    releaseAuthProvided: false,
    withGithub: true,
    withNpm: true,
    withBeta: true,
    withGithubProvided: false,
    withNpmProvided: false,
    withBetaProvided: false,
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

    if (token === '--adapter') {
      args.adapter = parseValueFlag(argv, i, '--adapter');
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

    if (token === '--release-auth') {
      args.releaseAuth = parseValueFlag(argv, i, '--release-auth');
      args.releaseAuthProvided = true;
      i += 1;
      continue;
    }

    if (token === '--with-github') {
      args.withGithub = true;
      args.withGithubProvided = true;
      continue;
    }

    if (token === '--with-npm') {
      args.withNpm = true;
      args.withNpmProvided = true;
      continue;
    }

    if (token === '--with-beta') {
      args.withBeta = true;
      args.withBetaProvided = true;
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

  if (!['npm', 'firebase'].includes(args.adapter)) {
    throw new Error('Invalid --adapter value. Expected npm or firebase.');
  }

  if (args.adapter === 'firebase') {
    if (!args.withNpmProvided) {
      args.withNpm = false;
    }
    if (!args.withBetaProvided) {
      args.withBeta = false;
    }
    if (!args.withGithubProvided) {
      args.withGithub = true;
    }
  }

  return args;
}

function parseSetupGithubArgs(argv) {
  const args = {
    dir: process.cwd(),
    adapter: 'npm',
    betaBranch: DEFAULT_BETA_BRANCH,
    defaultBranch: DEFAULT_BASE_BRANCH,
    baseBranch: DEFAULT_FIREBASE_BASE_BRANCH,
    productionBranch: DEFAULT_FIREBASE_PRODUCTION_BRANCH,
    releaseAuth: DEFAULT_RELEASE_AUTH,
    releaseAuthProvided: false,
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

    if (token === '--adapter') {
      args.adapter = parseValueFlag(argv, i, '--adapter');
      i += 1;
      continue;
    }

    if (token === '--default-branch') {
      args.defaultBranch = parseValueFlag(argv, i, '--default-branch');
      i += 1;
      continue;
    }

    if (token === '--base-branch') {
      args.baseBranch = parseValueFlag(argv, i, '--base-branch');
      i += 1;
      continue;
    }

    if (token === '--production-branch') {
      args.productionBranch = parseValueFlag(argv, i, '--production-branch');
      i += 1;
      continue;
    }

    if (token === '--beta-branch') {
      args.betaBranch = parseValueFlag(argv, i, '--beta-branch');
      i += 1;
      continue;
    }

    if (token === '--ruleset') {
      args.ruleset = parseValueFlag(argv, i, '--ruleset');
      i += 1;
      continue;
    }

    if (token === '--release-auth') {
      args.releaseAuth = parseValueFlag(argv, i, '--release-auth');
      args.releaseAuthProvided = true;
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

    throw new Error(`Invalid argument: ${token}\\n\\n${usage()}`);
  }

  if (!['npm', 'firebase'].includes(args.adapter)) {
    throw new Error('Invalid --adapter value. Expected npm or firebase.');
  }

  if (args.adapter === 'firebase') {
    if (!args.baseBranch) {
      throw new Error('Invalid --base-branch value for firebase adapter.');
    }
    if (!args.productionBranch) {
      throw new Error('Invalid --production-branch value for firebase adapter.');
    }
    args.defaultBranch = args.productionBranch;
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
    releaseAuth: DEFAULT_RELEASE_AUTH,
    releaseAuthProvided: false,
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

    if (token === '--release-auth') {
      args.releaseAuth = parseValueFlag(argv, i, '--release-auth');
      args.releaseAuthProvided = true;
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

function parseReleaseCycleArgs(argv) {
  const args = {
    repo: '',
    target: '',
    targets: 'single',
    mode: 'auto',
    phase: 'full',
    phaseProvided: false,
    track: 'auto',
    promoteStable: false,
    promoteType: 'patch',
    promoteSummary: 'Promote beta track to stable release.',
    head: '',
    base: '',
    title: '',
    taskId: '',
    body: '',
    bodyFile: '',
    npmPackages: [],
    updatePrDescription: false,
    draft: false,
    autoMerge: undefined,
    watchChecks: undefined,
    checkTimeout: undefined,
    confirmMerges: undefined,
    syncBase: undefined,
    resume: undefined,
    mergeWhenGreen: undefined,
    mergeMethod: undefined,
    waitReleasePr: undefined,
    releasePrTimeout: undefined,
    mergeReleasePr: undefined,
    verifyNpm: undefined,
    confirmCleanup: undefined,
    cleanup: undefined,
    yes: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--repo') {
      args.repo = parseValueFlag(argv, i, '--repo');
      i += 1;
      continue;
    }

    if (token === '--target') {
      args.target = parseValueFlag(argv, i, '--target');
      i += 1;
      continue;
    }

    if (token === '--targets') {
      args.targets = parseValueFlag(argv, i, '--targets');
      i += 1;
      continue;
    }

    if (token === '--mode') {
      args.mode = parseValueFlag(argv, i, '--mode');
      i += 1;
      continue;
    }

    if (token === '--phase') {
      args.phase = parseValueFlag(argv, i, '--phase');
      args.phaseProvided = true;
      i += 1;
      continue;
    }

    if (token === '--track') {
      args.track = parseValueFlag(argv, i, '--track');
      i += 1;
      continue;
    }

    if (token === '--promote-type') {
      args.promoteType = parseValueFlag(argv, i, '--promote-type');
      i += 1;
      continue;
    }

    if (token === '--promote-summary') {
      args.promoteSummary = parseValueFlag(argv, i, '--promote-summary');
      i += 1;
      continue;
    }

    if (token === '--head') {
      args.head = parseValueFlag(argv, i, '--head');
      i += 1;
      continue;
    }

    if (token === '--base') {
      args.base = parseValueFlag(argv, i, '--base');
      i += 1;
      continue;
    }

    if (token === '--title') {
      args.title = parseValueFlag(argv, i, '--title');
      i += 1;
      continue;
    }

    if (token === '--task-id') {
      args.taskId = parseValueFlag(argv, i, '--task-id');
      i += 1;
      continue;
    }

    if (token === '--body' || token === '--pr-description') {
      args.body = parseValueFlag(argv, i, token);
      i += 1;
      continue;
    }

    if (token === '--body-file' || token === '--pr-description-file') {
      args.bodyFile = parseValueFlag(argv, i, token);
      i += 1;
      continue;
    }

    if (token === '--npm-package') {
      args.npmPackages.push(parseValueFlag(argv, i, '--npm-package'));
      i += 1;
      continue;
    }

    if (token === '--update-pr-description') {
      args.updatePrDescription = true;
      continue;
    }

    if (token === '--check-timeout') {
      args.checkTimeout = Number.parseFloat(parseValueFlag(argv, i, '--check-timeout'));
      i += 1;
      continue;
    }

    if (token === '--release-pr-timeout') {
      args.releasePrTimeout = Number.parseFloat(parseValueFlag(argv, i, '--release-pr-timeout'));
      i += 1;
      continue;
    }

    if (token === '--merge-method') {
      args.mergeMethod = parseValueFlag(argv, i, '--merge-method');
      i += 1;
      continue;
    }

    if (token === '--draft') {
      args.draft = true;
      continue;
    }

    if (token === '--auto-merge') {
      args.autoMerge = true;
      continue;
    }

    if (token === '--watch-checks') {
      args.watchChecks = true;
      continue;
    }

    if (token === '--confirm-merges') {
      args.confirmMerges = true;
      continue;
    }

    if (token === '--sync-base') {
      args.syncBase = parseValueFlag(argv, i, '--sync-base');
      i += 1;
      continue;
    }

    if (token === '--no-resume') {
      args.resume = false;
      continue;
    }

    if (token === '--merge-when-green') {
      args.mergeWhenGreen = true;
      continue;
    }

    if (token === '--wait-release-pr') {
      args.waitReleasePr = true;
      continue;
    }

    if (token === '--merge-release-pr') {
      args.mergeReleasePr = true;
      continue;
    }

    if (token === '--promote-stable') {
      args.promoteStable = true;
      continue;
    }

    if (token === '--verify-npm') {
      args.verifyNpm = true;
      continue;
    }

    if (token === '--confirm-cleanup') {
      args.confirmCleanup = true;
      continue;
    }

    if (token === '--cleanup') {
      args.cleanup = true;
      continue;
    }

    if (token === '--no-cleanup') {
      args.cleanup = false;
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

  if (!['auto', 'code', 'publish'].includes(args.mode)) {
    throw new Error('Invalid --mode value. Expected auto, code, or publish.');
  }

  if (!['single', 'auto'].includes(args.targets)) {
    throw new Error('Invalid --targets value. Expected single or auto.');
  }

  if (!['code', 'full'].includes(args.phase)) {
    throw new Error('Invalid --phase value. Expected code or full.');
  }

  if (!['auto', 'beta', 'stable'].includes(args.track)) {
    throw new Error('Invalid --track value. Expected auto, beta, or stable.');
  }

  if (!['patch', 'minor', 'major'].includes(args.promoteType)) {
    throw new Error('Invalid --promote-type value. Expected patch, minor, or major.');
  }

  if (args.syncBase !== undefined && !['auto', 'rebase', 'merge', 'off'].includes(args.syncBase)) {
    throw new Error('Invalid --sync-base value. Expected auto, rebase, merge, or off.');
  }

  if (args.mergeMethod !== undefined && !['squash', 'merge', 'rebase'].includes(args.mergeMethod)) {
    throw new Error('Invalid --merge-method value. Expected squash, merge, or rebase.');
  }

  if (args.checkTimeout !== undefined && (!Number.isFinite(args.checkTimeout) || args.checkTimeout <= 0)) {
    throw new Error('Invalid --check-timeout value. Expected a positive number (minutes).');
  }

  if (args.releasePrTimeout !== undefined && (!Number.isFinite(args.releasePrTimeout) || args.releasePrTimeout <= 0)) {
    throw new Error('Invalid --release-pr-timeout value. Expected a positive number (minutes).');
  }

  return args;
}

function parseTaskArgs(argv) {
  const args = {
    action: '',
    id: '',
    type: 'feature',
    title: '',
    branch: '',
    dir: process.cwd(),
    json: false,
    dryRun: false,
    yes: false
  };

  if (!argv[0]) {
    args.help = true;
    return args;
  }

  args.action = argv[0];
  const allowedActions = new Set(['new', 'plan', 'tdd', 'implement', 'verify', 'publish-ready', 'status', 'doctor']);
  if (!allowedActions.has(args.action)) {
    throw new Error(`Invalid task action: ${args.action}\n\n${usage()}`);
  }

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--id') {
      args.id = parseValueFlag(argv, i, '--id');
      i += 1;
      continue;
    }

    if (token === '--type') {
      args.type = parseValueFlag(argv, i, '--type');
      i += 1;
      continue;
    }

    if (token === '--title') {
      args.title = parseValueFlag(argv, i, '--title');
      i += 1;
      continue;
    }

    if (token === '--branch') {
      args.branch = parseValueFlag(argv, i, '--branch');
      i += 1;
      continue;
    }

    if (token === '--dir') {
      args.dir = parseValueFlag(argv, i, '--dir');
      i += 1;
      continue;
    }

    if (token === '--json') {
      args.json = true;
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

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Invalid argument: ${token}\n\n${usage()}`);
  }

  if (!['feature', 'fix', 'chore', 'refactor', 'test'].includes(args.type)) {
    throw new Error(`Invalid --type value: ${args.type}. Expected feature, fix, chore, refactor, or test.`);
  }

  if (args.action === 'new' && !args.title) {
    throw new Error('Missing --title for "ship task new".');
  }

  if (args.action === 'status' && !args.id) {
    throw new Error('Missing --id for "ship task status".');
  }

  if ((args.action === 'plan' || args.action === 'implement' || args.action === 'verify' || args.action === 'publish-ready') && !args.id) {
    throw new Error(`Missing --id for "ship task ${args.action}".`);
  }

  return args;
}

function parseBooleanFlagValue(argv, index, flag) {
  const value = String(parseValueFlag(argv, index, flag)).trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`Invalid ${flag} value. Expected true or false.`);
}

function parseConfigArgs(argv) {
  const args = {
    action: '',
    scope: 'project',
    values: {},
    json: false,
    dryRun: false,
    help: false
  };

  if (!argv[0]) {
    args.help = true;
    return args;
  }

  args.action = argv[0];
  if (args.action !== 'defaults') {
    throw new Error(`Invalid config action: ${args.action}\n\n${usage()}`);
  }

  const booleanFlags = new Map([
    ['--auto-merge', 'autoMerge'],
    ['--watch-checks', 'watchChecks'],
    ['--confirm-merges', 'confirmMerges'],
    ['--resume', 'resume'],
    ['--merge-when-green', 'mergeWhenGreen'],
    ['--wait-release-pr', 'waitReleasePr'],
    ['--merge-release-pr', 'mergeReleasePr'],
    ['--verify-npm', 'verifyNpm'],
    ['--confirm-cleanup', 'confirmCleanup'],
    ['--cleanup', 'cleanup']
  ]);
  const numericFlags = new Map([
    ['--check-timeout', 'checkTimeout'],
    ['--release-pr-timeout', 'releasePrTimeout']
  ]);

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--scope') {
      args.scope = parseValueFlag(argv, i, '--scope');
      i += 1;
      continue;
    }

    if (booleanFlags.has(token)) {
      args.values[booleanFlags.get(token)] = parseBooleanFlagValue(argv, i, token);
      i += 1;
      continue;
    }

    if (numericFlags.has(token)) {
      args.values[numericFlags.get(token)] = Number.parseFloat(parseValueFlag(argv, i, token));
      i += 1;
      continue;
    }

    if (token === '--sync-base') {
      args.values.syncBase = parseValueFlag(argv, i, '--sync-base');
      i += 1;
      continue;
    }

    if (token === '--merge-method') {
      args.values.mergeMethod = parseValueFlag(argv, i, '--merge-method');
      i += 1;
      continue;
    }

    if (token === '--json') {
      args.json = true;
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

  if (!['global', 'project', 'local'].includes(args.scope)) {
    throw new Error('Invalid --scope value. Expected global, project, or local.');
  }

  const validationErrors = validateShipDefaults(args.values, []);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid config defaults:\n- ${validationErrors.join('\n- ')}`);
  }

  return args;
}

function validateReleaseAuthMode(mode, flagName = '--release-auth') {
  if (!RELEASE_AUTH_MODES.has(mode)) {
    throw new Error(`Invalid ${flagName} value: ${mode}. Expected one of: github-token, pat, app, manual-trigger.`);
  }
}

function parseArgs(argv) {
  if (!argv[0] || argv[0] === '--help' || argv[0] === '-h') {
    return {
      mode: 'help',
      args: {
        help: true
      }
    };
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    return {
      mode: 'version',
      args: {}
    };
  }

  if (argv[0] === 'completion') {
    const args = {
      shell: '',
      help: false
    };
    const remaining = argv.slice(1);
    for (let i = 0; i < remaining.length; i += 1) {
      const token = remaining[i];
      if (token === '--help' || token === '-h') {
        args.help = true;
        continue;
      }
      if (!args.shell) {
        args.shell = token;
        continue;
      }
      throw new Error(`Invalid argument: ${token}\n\n${usage()}`);
    }

    if (!args.help && !COMPLETION_SHELLS.has(args.shell)) {
      throw new Error(`Invalid completion shell: ${args.shell || '(missing)'}\nExpected one of: bash, zsh, fish.`);
    }

    return {
      mode: 'completion',
      args
    };
  }

  if (argv[0] === 'init') {
    const args = parseInitArgs(argv.slice(1));
    validateReleaseAuthMode(args.releaseAuth);
    return {
      mode: 'init',
      args
    };
  }

  if (argv[0] === 'setup-github') {
    const args = parseSetupGithubArgs(argv.slice(1));
    validateReleaseAuthMode(args.releaseAuth);
    return {
      mode: 'setup-github',
      args
    };
  }

  if (argv[0] === 'setup-npm') {
    return {
      mode: 'setup-npm',
      args: parseSetupNpmArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'setup-beta') {
    const args = parseSetupGithubArgs(argv.slice(1));
    validateReleaseAuthMode(args.releaseAuth);
    return {
      mode: 'setup-github',
      args
    };
  }

  if (argv[0] === 'promote-stable') {
    return {
      mode: 'promote-stable',
      args: parsePromoteStableArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'config') {
    return {
      mode: 'config',
      args: parseConfigArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'release') {
    return {
      mode: 'release',
      args: parseReleaseCycleArgs(argv.slice(1))
    };
  }

  if (argv[0] === 'task') {
    return {
      mode: 'task',
      args: parseTaskArgs(argv.slice(1))
    };
  }

  const args = parseCreateArgs(argv);
  validateReleaseAuthMode(args.releaseAuth);
  return {
    mode: 'create',
    args
  };
}

function shellWords(items) {
  return items.join(' ');
}

function valuesCaseEntries() {
  const allEntries = [];
  for (const spec of Object.values(COMMAND_COMPLETION_SPEC)) {
    for (const [flag, values] of Object.entries(spec.values || {})) {
      allEntries.push([flag, values]);
    }
  }
  const seen = new Set();
  const uniqueEntries = [];
  for (const [flag, values] of allEntries) {
    const key = `${flag}::${values.join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEntries.push([flag, values]);
    }
  }
  return uniqueEntries;
}

function renderBashCompletion() {
  const commandCases = ROOT_COMMANDS
    .filter((command) => command !== 'completion')
    .map((command) => {
      const options = COMMAND_COMPLETION_SPEC[command] ? COMMAND_COMPLETION_SPEC[command].options : [];
      return `    ${command}) opts="${shellWords(options)}" ;;`;
    })
    .join('\n');

  const valueCases = valuesCaseEntries()
    .map(([flag, values]) => `    ${flag}) COMPREPLY=( $(compgen -W "${shellWords(values)}" -- "$cur") ); return 0 ;;`)
    .join('\n');

  return [
    '# ship bash completion',
    '_ship_completion() {',
    '  local cur prev cmd',
    '  COMPREPLY=()',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '',
    '  case "$prev" in',
    valueCases || '    # no value options',
    '  esac',
    '',
    '  cmd=""',
    '  for ((i=1; i<COMP_CWORD; i++)); do',
    '    if [[ "${COMP_WORDS[i]}" != -* ]]; then',
    '      cmd="${COMP_WORDS[i]}"',
    '      break',
    '    fi',
    '  done',
    '',
    '  if [[ -z "$cmd" ]]; then',
    `    COMPREPLY=( $(compgen -W "${shellWords([...ROOT_COMMANDS, ...ROOT_OPTIONS])}" -- "$cur") )`,
    '    return 0',
    '  fi',
    '',
    '  local opts',
    '  case "$cmd" in',
    commandCases,
    '    completion) opts="--help -h bash zsh fish" ;;',
    '    *) opts="" ;;',
    '  esac',
    '',
    '  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )',
    '  return 0',
    '}',
    'complete -F _ship_completion ship',
    ''
  ].join('\n');
}

function renderZshCompletion() {
  const commandCases = ROOT_COMMANDS
    .filter((command) => command !== 'completion')
    .map((command) => {
      const options = COMMAND_COMPLETION_SPEC[command] ? COMMAND_COMPLETION_SPEC[command].options : [];
      return `    ${command}) compadd -- ${options.join(' ')} ;;`;
    })
    .join('\n');

  const valueCases = valuesCaseEntries()
    .map(([flag, values]) => `    ${flag}) compadd -- ${values.join(' ')}; return ;;`)
    .join('\n');

  return [
    '#compdef ship',
    '',
    '_ship() {',
    '  local cur prev cmd',
    '  cur="${words[CURRENT]}"',
    '  prev="${words[CURRENT-1]}"',
    '  cmd=""',
    '',
    '  case "$prev" in',
    valueCases || '    # no value options',
    '  esac',
    '',
    '  local i',
    '  for ((i=2; i<CURRENT; i++)); do',
    '    if [[ "${words[i]}" != -* ]]; then',
    '      cmd="${words[i]}"',
    '      break',
    '    fi',
    '  done',
    '',
    '  if [[ -z "$cmd" ]]; then',
    `    compadd -- ${[...ROOT_COMMANDS, ...ROOT_OPTIONS].join(' ')}`,
    '    return',
    '  fi',
    '',
    '  case "$cmd" in',
    commandCases,
    '    completion) compadd -- --help -h bash zsh fish ;;',
    '  esac',
    '}',
    '',
    'compdef _ship ship',
    ''
  ].join('\n');
}

function renderFishCompletion() {
  const lines = [];
  lines.push('# ship fish completion');
  lines.push('complete -c ship -f');
  for (const command of ROOT_COMMANDS) {
    lines.push(`complete -c ship -n \"__fish_use_subcommand\" -a \"${command}\"`);
  }

  lines.push('complete -c ship -n "__fish_use_subcommand" -l help');
  lines.push('complete -c ship -n "__fish_use_subcommand" -s h');
  lines.push('complete -c ship -n "__fish_use_subcommand" -l version');
  lines.push('complete -c ship -n "__fish_use_subcommand" -s v');

  for (const [command, spec] of Object.entries(COMMAND_COMPLETION_SPEC)) {
    if (command === 'create' || command === 'completion') {
      continue;
    }
    for (const option of spec.options) {
      if (!option.startsWith('--')) {
        continue;
      }
      const longName = option.slice(2);
      lines.push(`complete -c ship -n \"__fish_seen_subcommand_from ${command}\" -l ${longName}`);
    }
    for (const [flag, values] of Object.entries(spec.values || {})) {
      if (!flag.startsWith('--')) {
        continue;
      }
      lines.push(`complete -c ship -n \"__fish_seen_subcommand_from ${command}\" -l ${flag.slice(2)} -xa \"${values.join(' ')}\"`);
    }
  }

  lines.push('complete -c ship -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"');
  lines.push('');
  return lines.join('\n');
}

function renderCompletion(shell) {
  if (shell === 'bash') {
    return renderBashCompletion();
  }
  if (shell === 'zsh') {
    return renderZshCompletion();
  }
  if (shell === 'fish') {
    return renderFishCompletion();
  }

  throw new Error(`Unsupported shell "${shell}" for completion.`);
}

function resolveTaskConfig(config = {}) {
  const task = config.task && typeof config.task === 'object' ? config.task : {};
  return {
    engine: task.engine || '@i-santos/workflow',
    plansDir: task.plansDir || 'docs/plans',
    stateDir: task.stateDir || 'kanban',
    requireCleanTree: task.requireCleanTree !== false
  };
}

function sanitizeTaskTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'task';
}

function createTaskId(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `tsk_${y}${m}${d}_${hh}${mm}${ss}`;
}

function ensureDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function appendOperationLog(stateDir, op) {
  const opsPath = path.join(stateDir, 'ops.log');
  const line = `${JSON.stringify(op)}\n`;
  fs.appendFileSync(opsPath, line, 'utf8');
}

function resolveAdmiralPaths(cwd = process.cwd()) {
  return {
    admiralDir: path.join(cwd, '.admiral'),
    configPath: path.join(cwd, '.admiral', 'config.json'),
    graphPath: path.join(cwd, 'kanban', 'graph.json'),
    boardPath: path.join(cwd, 'kanban', 'board.json'),
    eventsPath: path.join(cwd, 'events', 'events.log')
  };
}

function createEmptyAdmiralGraph() {
  return {
    version: 1,
    tasks: []
  };
}

function createEmptyAdmiralBoard() {
  return {
    updated_at: new Date(0).toISOString(),
    columns: {
      todo: [],
      claimed: [],
      running: [],
      review: [],
      done: [],
      failed: [],
      blocked: [],
      retry_wait: [],
      cancelled: []
    },
    active_agents: []
  };
}

function createDefaultAdmiralConfig() {
  return {
    max_agents: 2,
    scheduler_interval_ms: 2000,
    heartbeat_timeout_ms: 15000,
    max_retries_per_task: 2,
    auto_merge: false,
    default_branch: 'main',
    agent_command: 'node -e "setTimeout(()=>process.exit(0), 250)"',
    scopes: {
      general: ['/*']
    }
  };
}

function ensureAdmiralTaskScaffold(workingDir, plansDir) {
  const paths = resolveAdmiralPaths(workingDir);
  ensureDirectory(paths.admiralDir);
  ensureDirectory(path.join(paths.admiralDir, 'locks'));
  ensureDirectory(path.dirname(paths.graphPath));
  ensureDirectory(path.dirname(paths.eventsPath));
  ensureDirectory(path.resolve(workingDir, plansDir));
  ensureDirectory(path.resolve(workingDir, 'docs/tests'));

  if (!fs.existsSync(paths.configPath)) {
    writeJsonFile(paths.configPath, createDefaultAdmiralConfig());
  }
  if (!fs.existsSync(paths.graphPath)) {
    writeJsonFile(paths.graphPath, createEmptyAdmiralGraph());
  }
  if (!fs.existsSync(paths.boardPath)) {
    writeJsonFile(paths.boardPath, createEmptyAdmiralBoard());
  }
  if (!fs.existsSync(paths.eventsPath)) {
    fs.writeFileSync(paths.eventsPath, '');
  }

  return paths;
}

function readAdmiralGraph(workingDir, config = {}) {
  const taskConfig = resolveTaskConfig(config);
  const paths = ensureAdmiralTaskScaffold(workingDir, taskConfig.plansDir);
  return {
    paths,
    graph: readJsonFile(paths.graphPath)
  };
}

function writeAdmiralGraph(paths, graph) {
  writeJsonFile(paths.graphPath, graph);
}

function resolveLegacyTaskFilePath(taskId, cwd = process.cwd()) {
  return path.join(cwd, '.agents', 'state', 'tasks', `${taskId}.json`);
}

function buildTaskOutput(task) {
  const record = readTaskRecord(task);
  return {
    ...record,
    title: record.title || task.title,
    branch: record.branch || task.branch || '',
    workspace: record.workspace || task.workspace || '',
    admiral: {
      status: task.status,
      scope: task.scope,
      priority: task.priority,
      dependsOn: Array.isArray(task.depends_on) ? [...task.depends_on] : []
    }
  };
}

function importLegacyTaskIfPresent(taskId, graph, cwd = process.cwd()) {
  if (graph.tasks.some((task) => task.id === taskId)) {
    return graph.tasks.find((task) => task.id === taskId);
  }

  const legacyTaskPath = resolveLegacyTaskFilePath(taskId, cwd);
  if (!fs.existsSync(legacyTaskPath)) {
    return null;
  }

  const legacyTask = readJsonFile(legacyTaskPath);
  const importedTask = {
    id: legacyTask.taskId,
    title: legacyTask.title || legacyTask.taskId,
    scope: 'general',
    status: 'todo',
    priority: 1,
    depends_on: [],
    agent: null,
    branch: legacyTask.branch || null,
    workspace: legacyTask.workspace || null,
    retries: 0,
    hooks: {},
    metadata: attachTaskRecord(
      { metadata: {} },
      createTaskRecord(legacyTask)
    ).metadata
  };
  graph.tasks.push(importedTask);
  return importedTask;
}

function getTaskContainer(taskId, config = {}, cwd = process.cwd()) {
  const { paths, graph } = readAdmiralGraph(cwd, config);
  const importedTask = importLegacyTaskIfPresent(taskId, graph, cwd);
  if (importedTask) {
    writeAdmiralGraph(paths, graph);
  }

  const task = graph.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return {
    paths,
    graph,
    task
  };
}

function updateTaskRecord(taskId, config, cwd, updater) {
  if (!taskId) {
    return null;
  }

  const context = getTaskContainer(taskId, config, cwd);
  const nextTask = updater(context.task);
  context.graph.tasks = context.graph.tasks.map((entry) => (entry.id === taskId ? nextTask : entry));
  writeAdmiralGraph(context.paths, context.graph);
  return {
    graphPath: context.paths.graphPath,
    task: buildTaskOutput(nextTask)
  };
}

function attachTaskPrReference(taskId, prNumber, config = {}, cwd = process.cwd(), options = {}) {
  if (!taskId || !prNumber || options.dryRun) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const result = updateTaskRecord(taskId, config, cwd, (existing) => {
    const workflowTask = readTaskRecord(existing);
    return attachTaskRecord(existing, {
      ...workflowTask,
      updatedAt: nowIso,
      release: {
        ...(workflowTask.release || {}),
        prNumber
      }
    });
  });

  return result.task;
}

function markTaskMerged(taskId, mergeCommit, config = {}, cwd = process.cwd(), options = {}) {
  if (!taskId || !mergeCommit || options.dryRun) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const result = updateTaskRecord(taskId, config, cwd, (existing) => {
    const workflowTask = readTaskRecord(existing);
    return attachTaskRecord(existing, {
      ...workflowTask,
      updatedAt: nowIso,
      release: {
        ...(workflowTask.release || {}),
        mergeCommit
      }
    });
  });

  return result.task;
}

function markTaskReleased(taskId, config = {}, cwd = process.cwd(), options = {}) {
  if (!taskId || options.dryRun) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const result = updateTaskRecord(taskId, config, cwd, (existing) => {
    const workflowTask = readTaskRecord(existing);
    return attachTaskRecord(existing, {
      ...workflowTask,
      status: 'released',
      updatedAt: nowIso,
      release: {
        ...(workflowTask.release || {}),
        published: true
      }
    });
  });

  return result.task;
}

function createTaskContainer(taskRecord, scope = 'general') {
  return attachTaskRecord({
    id: taskRecord.taskId,
    title: taskRecord.title,
    scope,
    status: 'todo',
    priority: 1,
    depends_on: [],
    agent: null,
    branch: taskRecord.branch || null,
    workspace: taskRecord.workspace || null,
    retries: 0,
    hooks: {},
    metadata: {}
  }, taskRecord);
}

function runTaskCommand(args, config = {}, dependencies = {}) {
  const nowIso = new Date().toISOString();
  const workingDir = path.resolve(args.dir || process.cwd());
  const taskConfig = resolveTaskConfig(config);
  const plansDir = path.resolve(workingDir, taskConfig.plansDir);

  let workflowApi;
  if (taskConfig.engine === '@i-santos/workflow') {
    workflowApi = {
      createTaskRecord,
      readTaskRecord,
      transitionTask
    };
  } else if (typeof dependencies.resolveTaskEngine === 'function') {
    workflowApi = dependencies.resolveTaskEngine(taskConfig.engine);
  } else {
    throw new Error(`Unsupported task engine "${taskConfig.engine}".`);
  }

  const output = {
    ok: true,
    action: args.action,
    dryRun: Boolean(args.dryRun)
  };

  const deprecatedActionMap = {
    new: 'admiral task create <id>',
    plan: 'admiral task plan <id>',
    tdd: 'admiral task tdd <id>',
    implement: 'admiral task implement <id>',
    verify: 'admiral task verify <id>',
    'publish-ready': 'admiral task publish-ready <id>'
  };

  if (deprecatedActionMap[args.action]) {
    throw new Error(
      [
        `ship task ${args.action} is no longer supported.`,
        `Use "${deprecatedActionMap[args.action]}" instead.`,
        'ship only keeps task status/doctor as temporary compatibility commands.'
      ].join('\n')
    );
  }

  if (args.action === 'doctor') {
    const admiralPaths = resolveAdmiralPaths(workingDir);
    const checks = [
      { name: 'engine', status: workflowApi ? 'pass' : 'fail', detail: taskConfig.engine },
      { name: 'cwd', status: fs.existsSync(workingDir) ? 'pass' : 'fail', detail: workingDir },
      { name: 'admiralDir', status: fs.existsSync(admiralPaths.admiralDir) ? 'pass' : 'warn', detail: admiralPaths.admiralDir },
      { name: 'graph', status: fs.existsSync(admiralPaths.graphPath) ? 'pass' : 'warn', detail: admiralPaths.graphPath },
      { name: 'legacyState', status: fs.existsSync(path.join(workingDir, '.agents', 'state')) ? 'warn' : 'pass', detail: path.join(workingDir, '.agents', 'state') }
    ];
    output.checks = checks;
    output.deprecated = true;
    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    console.log('ship task is deprecated; use admiral task/create/status/run for canonical orchestration.');
    console.log(`task doctor (${taskConfig.engine})`);
    for (const check of checks) {
      console.log(`- ${check.name}: ${check.status} (${check.detail})`);
    }
    return;
  }

  if (args.action === 'status') {
    const taskRecord = buildTaskOutput(getTaskContainer(args.id, config, workingDir).task);
    output.task = taskRecord;
    output.deprecated = true;
    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    console.log('ship task is deprecated; use admiral for canonical orchestration.');
    console.log(`task status: ${taskRecord.taskId}`);
    console.log(`- title: ${taskRecord.title}`);
    console.log(`- status: ${taskRecord.status}`);
    console.log(`- branch: ${taskRecord.branch}`);
    console.log(`- updatedAt: ${taskRecord.updatedAt}`);
    return;
  }

  throw new Error(`Task action "${args.action}" is not supported in ship. Use admiral for task creation and lifecycle management.`);
}

function loadShipConfig(cwd = process.cwd()) {
  const defaultConfig = {
    adapter: 'npm',
    adapterModule: '',
    releaseTargets: [],
    releasePolicy: {
      stopOnError: true
    },
    defaults: {
      autoMerge: true,
      watchChecks: true,
      checkTimeout: 30,
      confirmMerges: false,
      syncBase: 'auto',
      resume: true,
      mergeWhenGreen: true,
      mergeMethod: 'merge',
      waitReleasePr: true,
      releasePrTimeout: 30,
      mergeReleasePr: true,
      verifyNpm: true,
      confirmCleanup: false,
      cleanup: true
    }
  };
  const sources = [
    resolveGlobalShipConfigPath(),
    path.join(cwd, '.ship.json'),
    path.join(cwd, '.ship.local.json')
  ];

  return sources.reduce((current, sourcePath) => {
    if (!fs.existsSync(sourcePath)) {
      return current;
    }

    return mergeConfigObjects(current, readJsonFile(sourcePath));
  }, defaultConfig);
}

function validateShipConfig(config = {}) {
  const errors = [];
  const adapter = String(config.adapter || 'npm');
  const releaseTargets = Array.isArray(config.releaseTargets)
    ? config.releaseTargets
    : [];
  const includesFirebaseTarget = releaseTargets.some((target) => String(target).trim() === 'firebase');

  if (config.releaseTargets !== undefined) {
    if (!Array.isArray(config.releaseTargets)) {
      errors.push('"releaseTargets" must be an array when provided.');
    } else if (config.releaseTargets.some((target) => typeof target !== 'string' || !target.trim())) {
      errors.push('"releaseTargets" entries must be non-empty strings.');
    }
  }

  if (config.releasePolicy !== undefined) {
    if (!config.releasePolicy || typeof config.releasePolicy !== 'object' || Array.isArray(config.releasePolicy)) {
      errors.push('"releasePolicy" must be an object when provided.');
    } else if (config.releasePolicy.stopOnError !== undefined && typeof config.releasePolicy.stopOnError !== 'boolean') {
      errors.push('"releasePolicy.stopOnError" must be boolean when provided.');
    }
  }

  if (config.defaults !== undefined) {
    if (!config.defaults || typeof config.defaults !== 'object' || Array.isArray(config.defaults)) {
      errors.push('"defaults" must be an object when provided.');
    } else {
      validateShipDefaults(config.defaults, errors);
    }
  }

  if (adapter !== 'firebase' && !includesFirebaseTarget) {
    if (errors.length > 0) {
      throw new Error(`Invalid ship config:\n- ${errors.join('\n- ')}`);
    }
    return;
  }

  const firebase = config.firebase || {};
  const deploy = config.deploy || {};

  if (typeof firebase.projectId !== 'string' || !firebase.projectId.trim()) {
    errors.push('"firebase.projectId" is required when adapter="firebase".');
  }

  if (!Array.isArray(firebase.environments) || firebase.environments.length === 0) {
    errors.push('"firebase.environments" must be a non-empty array when adapter="firebase".');
  } else {
    const invalidEnv = firebase.environments.find((entry) => typeof entry !== 'string' || !entry.trim());
    if (invalidEnv !== undefined) {
      errors.push('"firebase.environments" entries must be non-empty strings.');
    }
  }

  if (firebase.healthcheckUrls !== undefined) {
    if (!firebase.healthcheckUrls || typeof firebase.healthcheckUrls !== 'object' || Array.isArray(firebase.healthcheckUrls)) {
      errors.push('"firebase.healthcheckUrls" must be an object when provided.');
    } else {
      for (const [env, url] of Object.entries(firebase.healthcheckUrls)) {
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
          errors.push(`"firebase.healthcheckUrls.${env}" must be an absolute http(s) URL.`);
        }
      }
    }
  }

  if (typeof deploy.workflow !== 'string' || !deploy.workflow.trim()) {
    errors.push('"deploy.workflow" is required when adapter="firebase".');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ship config:\n- ${errors.join('\n- ')}`);
  }
}

function resolveGlobalShipConfigPath() {
  const configHome = process.env.XDG_CONFIG_HOME
    ? path.resolve(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), '.config');
  return path.join(configHome, 'ship', 'config.json');
}

function resolveShipConfigPathByScope(scope, cwd = process.cwd()) {
  if (scope === 'global') {
    return resolveGlobalShipConfigPath();
  }
  if (scope === 'local') {
    return path.join(cwd, '.ship.local.json');
  }
  return path.join(cwd, '.ship.json');
}

function mergeConfigObjects(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue) ? [...overrideValue] : overrideValue;
  }

  if (!baseValue || typeof baseValue !== 'object' || !overrideValue || typeof overrideValue !== 'object') {
    return overrideValue === undefined ? baseValue : overrideValue;
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(overrideValue)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && baseValue[key] && typeof baseValue[key] === 'object' && !Array.isArray(baseValue[key])) {
      merged[key] = mergeConfigObjects(baseValue[key], value);
    } else {
      merged[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return merged;
}

function validateShipDefaults(defaults = {}, errors = []) {
  const booleanKeys = ['autoMerge', 'watchChecks', 'confirmMerges', 'resume', 'mergeWhenGreen', 'waitReleasePr', 'mergeReleasePr', 'verifyNpm', 'confirmCleanup', 'cleanup'];
  for (const key of booleanKeys) {
    if (defaults[key] !== undefined && typeof defaults[key] !== 'boolean') {
      errors.push(`"defaults.${key}" must be boolean when provided.`);
    }
  }

  const numberKeys = ['checkTimeout', 'releasePrTimeout'];
  for (const key of numberKeys) {
    if (defaults[key] !== undefined && (!Number.isFinite(defaults[key]) || defaults[key] <= 0)) {
      errors.push(`"defaults.${key}" must be a positive number when provided.`);
    }
  }

  if (defaults.syncBase !== undefined && !['auto', 'rebase', 'merge', 'off'].includes(defaults.syncBase)) {
    errors.push('"defaults.syncBase" must be one of: auto, rebase, merge, off.');
  }

  if (defaults.mergeMethod !== undefined && !['squash', 'merge', 'rebase'].includes(defaults.mergeMethod)) {
    errors.push('"defaults.mergeMethod" must be one of: squash, merge, rebase.');
  }

  return errors;
}

function updateConfigDefaultsForScope(args, cwd = process.cwd()) {
  const configPath = resolveShipConfigPathByScope(args.scope, cwd);
  const existing = fs.existsSync(configPath) ? readJsonFile(configPath) : {};
  const existingDefaults = existing && existing.defaults && typeof existing.defaults === 'object' && !Array.isArray(existing.defaults)
    ? existing.defaults
    : {};
  const nextDefaults = {
    ...existingDefaults,
    ...args.values
  };
  const validationErrors = validateShipDefaults(nextDefaults, []);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid ship config defaults:\n- ${validationErrors.join('\n- ')}`);
  }

  const nextConfig = {
    ...existing,
    defaults: nextDefaults
  };

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    writeJsonFile(configPath, nextConfig);
  }

  return {
    scope: args.scope,
    path: configPath,
    changedKeys: Object.keys(args.values),
    defaults: nextDefaults,
    config: nextConfig,
    dryRun: args.dryRun
  };
}

function printConfigDefaultsResult(result, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`ship config defaults (${result.scope})`);
  console.log(`path: ${result.path}`);
  console.log(`mode: ${result.dryRun ? 'dry-run' : 'applied'}`);
  console.log(`changed keys: ${result.changedKeys.length ? result.changedKeys.join(', ') : 'none (show current defaults)'}`);
  console.log('');
  console.log(JSON.stringify(result.defaults, null, 2));
}

function applyReleaseArgDefaults(args = {}, config = {}) {
  const configDefaults = config.defaults || {};
  const builtinDefaults = {
    autoMerge: true,
    watchChecks: true,
    checkTimeout: 30,
    confirmMerges: false,
    syncBase: 'auto',
    resume: true,
    mergeWhenGreen: true,
    mergeMethod: 'merge',
    waitReleasePr: true,
    releasePrTimeout: 30,
    mergeReleasePr: true,
    verifyNpm: true,
    confirmCleanup: false,
    cleanup: true
  };

  const resolved = { ...args };
  for (const [key, fallbackValue] of Object.entries(builtinDefaults)) {
    if (resolved[key] === undefined) {
      resolved[key] = configDefaults[key] !== undefined ? configDefaults[key] : fallbackValue;
    }
  }

  return resolved;
}

function resolveReleaseAdapterName(args = {}, config = {}, warn = () => {}) {
  if (args.target) {
    return String(args.target).trim();
  }

  const configuredTargets = Array.isArray(config.releaseTargets)
    ? config.releaseTargets.map((target) => String(target).trim()).filter(Boolean)
    : [];

  if (configuredTargets.length === 0) {
    return String(config.adapter || 'npm');
  }

  if (configuredTargets.length > 1) {
    warn(`Multiple releaseTargets configured (${configuredTargets.join(', ')}). Using "${configuredTargets[0]}". Pass --target to select explicitly.`);
  }

  return configuredTargets[0];
}

function resolveReleaseTargetPlan(args = {}, config = {}, warn = () => {}) {
  if (args.target) {
    return [String(args.target).trim()];
  }

  const configuredTargets = Array.isArray(config.releaseTargets)
    ? config.releaseTargets.map((target) => String(target).trim()).filter(Boolean)
    : [];

  if (args.targets === 'auto') {
    if (configuredTargets.length > 0) {
      return [...new Set(configuredTargets)];
    }
    return [String(config.adapter || 'npm')];
  }

  return [resolveReleaseAdapterName(args, config, warn)];
}

async function runReleaseByTargets(args, config = {}, dependencies = {}, options = {}) {
  const warn = typeof options.warn === 'function'
    ? options.warn
    : (message) => console.warn(`[WARN] ${message}`);
  const info = typeof options.info === 'function'
    ? options.info
    : (message) => console.log(`[INFO] ${message}`);
  const resolveAdapterByName = options.resolveAdapterByName;
  const runReleaseForTarget = options.runReleaseForTarget;

  if (typeof resolveAdapterByName !== 'function') {
    throw new Error('runReleaseByTargets requires resolveAdapterByName option.');
  }
  if (typeof runReleaseForTarget !== 'function') {
    throw new Error('runReleaseByTargets requires runReleaseForTarget option.');
  }

  const targets = resolveReleaseTargetPlan(args, config, warn);
  const stopOnError = !(config.releasePolicy && config.releasePolicy.stopOnError === false);
  const results = [];

  for (const target of targets) {
    const adapter = resolveAdapterByName(target);
    const releaseArgs = {
      ...applyReleaseArgDefaults(args, config),
      target
    };

    if (targets.length > 1) {
      info(`Running release target "${target}"...`);
    }

    try {
      await runReleaseForTarget(releaseArgs, adapter);
      results.push({ target, ok: true });
      if (targets.length > 1) {
        info(`Release target "${target}" completed.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ target, ok: false, error: message });
      warn(`Release target "${target}" failed: ${message}`);
      if (stopOnError) {
        throw error;
      }
    }
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`Release failed for targets: ${failed.map((result) => result.target).join(', ')}`);
  }

  return results;
}

function resolveAdapter(name, options = {}) {
  if (name === 'npm') {
    validateAdapterShape(npmAdapter);
    return npmAdapter;
  }
  if (name === 'firebase') {
    validateAdapterShape(firebaseAdapter);
    return firebaseAdapter;
  }

  if (typeof options.resolveAdapter === 'function') {
    const external = options.resolveAdapter(name, options);
    if (external) {
      validateAdapterShape(external);
      return external;
    }
  }

  if (options.adapterModule) {
    const loaded = require(path.resolve(options.cwd || process.cwd(), options.adapterModule));
    const candidate = loaded && loaded.default ? loaded.default : loaded;
    if (candidate && candidate.name === name) {
      validateAdapterShape(candidate);
      return candidate;
    }
    if (candidate && typeof candidate.resolveAdapter === 'function') {
      const resolved = candidate.resolveAdapter(name, options);
      if (resolved) {
        validateAdapterShape(resolved);
        return resolved;
      }
    }
  }

  throw new Error(`Unsupported adapter "${name}".`);
}

function runCodePrCore(args, adapter, dependencies = {}, config = {}) {
  const normalized = normalizeArgsWithAdapter(adapter, args, 'release');
  const adapted = applyOpenPrAdapterContext(adapter, normalized, config, dependencies);
  return runCodePrFlow(adapted, dependencies, config);
}

function withShipConfigDefaults(args, config = {}) {
  const next = { ...args };
  if (config.baseBranch && (!next.base || next.base === DEFAULT_BETA_BRANCH)) {
    next.base = config.baseBranch;
  }
  if (config.betaBranch && (!next.base || next.base === DEFAULT_BETA_BRANCH)) {
    next.base = config.betaBranch;
  }
  return next;
}

function normalizeArgsWithAdapter(adapter, args, command) {
  if (!adapter || typeof adapter.normalizeArgs !== 'function') {
    return { ...args };
  }

  return adapter.normalizeArgs({ ...args }, { command }) || { ...args };
}

function applyOpenPrAdapterContext(adapter, args, config = {}, dependencies = {}) {
  const withDefaults = withShipConfigDefaults(args, config);
  if (!adapter || typeof adapter.preparePrContext !== 'function') {
    return withDefaults;
  }

  const patch = adapter.preparePrContext({
    args: withDefaults,
    config,
    dependencies,
    constants: {
      DEFAULT_BASE_BRANCH,
      DEFAULT_BETA_BRANCH
    }
  });
  if (!patch || typeof patch !== 'object') {
    return withDefaults;
  }

  return {
    ...withDefaults,
    ...patch
  };
}

function runReleaseCycleCore(args, adapter, dependencies = {}, config = {}) {
  validateAdapterForCapability(adapter, 'release');
  const normalized = normalizeArgsWithAdapter(adapter, withShipConfigDefaults(args, config), 'release');
  return runReleaseCycle(normalized, dependencies, adapter, config);
}

function requireAdapterMethod(adapter, methodName) {
  if (!adapter || typeof adapter[methodName] !== 'function') {
    throw new Error(`Adapter "${adapter && adapter.name ? adapter.name : 'unknown'}" must implement "${methodName}" for this command.`);
  }
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

function buildReleaseAuthVariables(releaseAuthMode) {
  if (releaseAuthMode === 'github-token') {
    return {
      RELEASE_AUTH_APP_STEP: '',
      RELEASE_AUTH_CHECKOUT_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      RELEASE_AUTH_GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}'
    };
  }

  if (releaseAuthMode === 'pat') {
    return {
      RELEASE_AUTH_APP_STEP: '',
      RELEASE_AUTH_CHECKOUT_TOKEN: '${{ secrets.CHANGESETS_GH_TOKEN || secrets.GITHUB_TOKEN }}',
      RELEASE_AUTH_GITHUB_TOKEN: '${{ secrets.CHANGESETS_GH_TOKEN || secrets.GITHUB_TOKEN }}'
    };
  }

  if (releaseAuthMode === 'app') {
    return {
      RELEASE_AUTH_APP_STEP: [
        '      - name: Generate GitHub App token',
        '        id: app-token',
        '        uses: actions/create-github-app-token@v1',
        '        with:',
        '          app-id: ${{ secrets.GH_APP_ID || secrets.GH_APP_CLIENT_ID }}',
        '          private-key: ${{ secrets.GH_APP_PRIVATE_KEY }}',
        ''
      ].join('\n'),
      RELEASE_AUTH_CHECKOUT_TOKEN: '${{ steps.app-token.outputs.token }}',
      RELEASE_AUTH_GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}'
    };
  }

  return {
    RELEASE_AUTH_APP_STEP: '',
    RELEASE_AUTH_CHECKOUT_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    RELEASE_AUTH_GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}'
  };
}

function appendReleaseAuthWarnings(summary, releaseAuthMode, options = {}) {
  if (releaseAuthMode === 'manual-trigger') {
    summary.warnings.push('release-auth recommendation: use pat/app when you need automatic CI retriggers for release PR updates.');
    summary.warnings.push('manual-trigger mode selected: release PR updates may not retrigger CI automatically.');
    summary.warnings.push('If release PR checks are pending, push an empty commit to changeset-release/* to retrigger CI.');
    return;
  }

  if (releaseAuthMode === 'app') {
    summary.warnings.push('release-auth recommendation: app mode is preferred for long-lived org/repo automation.');
    const missing = options.missingAppSecrets || [];
    if (missing.length > 0) {
      summary.warnings.push(`release-auth app mode selected: missing repository secrets: ${missing.join(', ')}`);
    } else if (options.appSecretsChecked) {
      summary.warnings.push('release-auth app mode selected: required repository secrets detected.');
    } else {
      summary.warnings.push('release-auth app mode selected: ensure GH_APP_CLIENT_ID (or GH_APP_ID) and GH_APP_PRIVATE_KEY repository secrets are configured.');
    }
    summary.warnings.push(`GitHub Apps overview: ${RELEASE_AUTH_DOC_LINKS.overview}`);
    summary.warnings.push(`Create GitHub App: ${RELEASE_AUTH_DOC_LINKS.create}`);
    summary.warnings.push(`Install GitHub App: ${RELEASE_AUTH_DOC_LINKS.install}`);
    summary.warnings.push(`Manage Actions secrets: ${RELEASE_AUTH_DOC_LINKS.secrets}`);
    summary.warnings.push(`Project guide: ${RELEASE_AUTH_DOC_LINKS.internal}`);
    return;
  }

  if (releaseAuthMode === 'pat') {
    summary.warnings.push('release-auth recommendation: pat mode is the fastest setup for solo/small projects.');
    summary.warnings.push('release-auth pat mode selected: ensure CHANGESETS_GH_TOKEN secret is configured for reliable release PR check retriggers.');
    return;
  }

  summary.warnings.push('release-auth recommendation: github-token mode is simplest, but may skip downstream workflow retriggers.');
}

async function resolveReleaseAuthSelection(args, summary, options = {}) {
  if (args.releaseAuthProvided) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    summary.warnings.push(`--release-auth not provided in non-interactive mode. Defaulting to "${args.releaseAuth}".`);
    return;
  }

  const selected = await askChoice(
    `${options.contextLabel || 'Select release auth mode'}:`,
    ['pat', 'app', 'github-token', 'manual-trigger'],
    0
  );

  args.releaseAuth = selected;
  summary.warnings.push(`release-auth selected interactively: ${selected}`);
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
  const unique = (values) => [...new Set(values)];
  const formatList = (values) => {
    const normalized = unique(values);
    if (!normalized.length) {
      return ['  - none'];
    }

    return normalized.map((item) => `  - ${item}`);
  };

  console.log(title);
  console.log('');
  console.log('Preflight');
  console.log('  - completed');
  console.log('');
  console.log('Apply');
  console.log('files created:');
  formatList(summary.createdFiles).forEach((line) => console.log(line));
  console.log('files overwritten:');
  formatList(summary.overwrittenFiles).forEach((line) => console.log(line));
  console.log('files skipped:');
  formatList(summary.skippedFiles).forEach((line) => console.log(line));
  console.log('scripts updated:');
  formatList(summary.updatedScriptKeys).forEach((line) => console.log(line));
  console.log('scripts skipped:');
  formatList(summary.skippedScriptKeys).forEach((line) => console.log(line));
  console.log('scripts removed:');
  formatList(summary.removedScriptKeys).forEach((line) => console.log(line));
  console.log('dependencies updated:');
  formatList(summary.updatedDependencyKeys).forEach((line) => console.log(line));
  console.log('dependencies skipped:');
  formatList(summary.skippedDependencyKeys).forEach((line) => console.log(line));
  console.log('');
  console.log('Summary');
  console.log('warnings:');
  formatList(summary.warnings).forEach((line) => console.log(line));
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

async function askChoice(questionText, choices, defaultIndex = 0) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return choices[defaultIndex];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const lines = choices.map((choice, index) => `${index + 1}. ${choice}`);
    const answer = await rl.question(`${questionText}\n${lines.join('\n')}\nSelect option [${defaultIndex + 1}]: `);
    const trimmed = answer.trim();
    if (!trimmed) {
      return choices[defaultIndex];
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isNaN(numeric) || numeric < 1 || numeric > choices.length) {
      return choices[defaultIndex];
    }

    return choices[numeric - 1];
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

function createOrchestrationSummary() {
  return {
    modeDetected: '',
    repoResolved: '',
    branchPushed: '',
    prAction: '',
    prUrl: '',
    autoMerge: '',
    checks: '',
    merge: '',
    releasePr: '',
    releaseTrack: '',
    promotionWorkflow: '',
    promotionPr: '',
    npmValidation: '',
    cleanup: '',
    actionsPerformed: [],
    actionsSkipped: [],
    warnings: [],
    errors: []
  };
}

function printOrchestrationSummary(title, summary) {
  const unique = (values) => [...new Set(values)];
  const formatList = (values) => {
    const normalized = unique(values || []);
    if (!normalized.length) {
      return ['  - none'];
    }

    return normalized.map((item) => `  - ${item}`);
  };

  console.log(title);
  console.log('');
  console.log('Preflight');
  console.log(`  - mode detected: ${summary.modeDetected || 'n/a'}`);
  console.log(`  - repo resolved: ${summary.repoResolved || 'n/a'}`);
  console.log('');
  console.log('Plan');
  console.log(`  - branch pushed: ${summary.branchPushed || 'n/a'}`);
  console.log(`  - pr created/updated/skipped: ${summary.prAction || 'n/a'}`);
  console.log(`  - pr url: ${summary.prUrl || 'n/a'}`);
  console.log('');
  console.log('Apply');
  console.log(`  - auto-merge enabled/skipped: ${summary.autoMerge || 'n/a'}`);
  console.log(`  - checks watched result: ${summary.checks || 'n/a'}`);
  console.log(`  - merge performed/skipped: ${summary.merge || 'n/a'}`);
  console.log(`  - release pr discovered/merged: ${summary.releasePr || 'n/a'}`);
  console.log(`  - release track: ${summary.releaseTrack || 'n/a'}`);
  console.log(`  - promotion workflow run: ${summary.promotionWorkflow || 'n/a'}`);
  console.log(`  - promotion PR: ${summary.promotionPr || 'n/a'}`);
  console.log(`  - npm validation: ${summary.npmValidation || 'n/a'}`);
  console.log(`  - cleanup: ${summary.cleanup || 'n/a'}`);
  console.log('actions performed:');
  formatList(summary.actionsPerformed).forEach((line) => console.log(line));
  console.log('actions skipped:');
  formatList(summary.actionsSkipped).forEach((line) => console.log(line));
  console.log('');
  console.log('Summary');
  console.log('warnings:');
  formatList(summary.warnings).forEach((line) => console.log(line));
  console.log('errors:');
  formatList(summary.errors).forEach((line) => console.log(line));
}

function parseJsonSafely(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function sleepMs(milliseconds) {
  const shared = new SharedArrayBuffer(4);
  const view = new Int32Array(shared);
  Atomics.wait(view, 0, 0, milliseconds);
}

function nowMs(deps) {
  if (deps && typeof deps.now === 'function') {
    return Number(deps.now());
  }

  return Date.now();
}

function waitForNextPoll(timeoutAt, defaultIntervalMs, deps) {
  const remainingMs = Math.max(0, timeoutAt - nowMs(deps));
  if (remainingMs <= 0) {
    return;
  }

  const pollMs = Math.max(100, Math.min(defaultIntervalMs, remainingMs));
  if (deps && typeof deps.sleep === 'function') {
    deps.sleep(pollMs);
    return;
  }

  sleepMs(pollMs);
}

function resolveGitContext(args, deps) {
  const insideWorkTree = deps.exec('git', ['rev-parse', '--is-inside-work-tree']);
  if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    throw new Error('Current directory is not a git repository.');
  }

  const headBranch = args.head || deps.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (!headBranch || headBranch === 'HEAD') {
    throw new Error('Detached HEAD is not supported. Checkout a branch and rerun.');
  }

  const repo = resolveRepo({ repo: args.repo }, deps);
  const baseBranch = args.base || (headBranch === DEFAULT_BETA_BRANCH ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH);
  const latestTitleResult = deps.exec('git', ['log', '-1', '--pretty=%s']);
  const latestTitle = latestTitleResult.status === 0 ? latestTitleResult.stdout.trim() : '';
  const title = args.title || latestTitle || headBranch;

  return {
    repo,
    head: headBranch,
    base: baseBranch,
    title
  };
}

function getRecentCommitSubjects(deps, count = 10) {
  const result = deps.exec('git', ['log', `-n${count}`, '--pretty=%h %s']);
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectChangesetPackages(cwd) {
  const changesetDir = path.join(cwd, '.changeset');
  if (!fs.existsSync(changesetDir)) {
    return [];
  }

  const files = fs.readdirSync(changesetDir)
    .filter((name) => name.endsWith('.md'));
  const packages = new Set();

  for (const fileName of files) {
    const fullPath = path.join(changesetDir, fileName);
    const content = fs.readFileSync(fullPath, 'utf8');
    const parts = content.split('---');
    if (parts.length < 3) {
      continue;
    }

    const frontmatter = parts[1];
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/"([^"]+)"\s*:/);
      if (match) {
        packages.add(match[1]);
      }
    }
  }

  return [...packages];
}

function renderPrBodyDeterministic(context, deps, options = {}) {
  const commits = getRecentCommitSubjects(deps, 10);
  const changedPackages = collectChangesetPackages(options.cwd || process.cwd());
  const summaryBlock = [
    '## Summary',
    `- Source branch: \`${context.head}\``,
    `- Target branch: \`${context.base}\``,
    ''
  ].join('\n');
  const changesBlock = [
    '## Changes',
    ...(commits.length ? commits.map((item) => `- ${item}`) : ['- No recent commit messages found.']),
    ''
  ].join('\n');
  const releaseImpactBlock = [
    '## Release Impact',
    ...(changedPackages.length
      ? changedPackages.map((name) => `- Changeset package: \`${name}\``)
      : ['- No explicit package entries found in `.changeset/*.md`.']),
    ''
  ].join('\n');
  const validationBlock = [
    '## Validation',
    '- [ ] `npm run check`',
    '- [ ] CI green',
    ''
  ].join('\n');
  const checklistBlock = [
    '## Checklist',
    '- [ ] Scope and risks reviewed',
    '- [ ] Release impact reviewed',
    '- [ ] Ready to merge',
    ''
  ].join('\n');
  const generated = [summaryBlock, changesBlock, releaseImpactBlock, validationBlock, checklistBlock].join('\n');

  if (options.body) {
    return options.body;
  }

  if (options.bodyFile) {
    const fullPath = path.resolve(options.cwd || process.cwd(), options.bodyFile);
    return fs.readFileSync(fullPath, 'utf8');
  }

  const templatePath = options.template
    ? path.resolve(options.cwd || process.cwd(), options.template)
    : path.resolve(options.cwd || process.cwd(), '.github/PULL_REQUEST_TEMPLATE.md');
  if (fs.existsSync(templatePath)) {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    if (templateContent.includes('<!-- GENERATED_PR_BODY -->')) {
      return templateContent.replace('<!-- GENERATED_PR_BODY -->', generated);
    }

    return `${templateContent.trim()}\n\n---\n\n${generated}`;
  }

  return generated;
}

function listOpenPullRequests(repo, deps) {
  const list = deps.exec('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number,url,title,headRefName,baseRefName']);
  if (list.status !== 0) {
    throw new Error(`Failed to list pull requests: ${list.stderr || list.stdout}`.trim());
  }

  const parsed = parseJsonSafely(list.stdout || '[]', []);
  return Array.isArray(parsed) ? parsed : [];
}

function findOpenPrByHeadBase(repo, head, base, deps) {
  const prs = listOpenPullRequests(repo, deps);
  return prs.find((item) => item.headRefName === head && item.baseRefName === base) || null;
}

function ensureBranchPushed(repo, head, deps) {
  const upstream = deps.exec('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const hasUpstream = upstream.status === 0;
  if (hasUpstream) {
    const ahead = deps.exec('git', ['rev-list', '--count', '@{u}..HEAD']);
    const aheadCount = ahead.status === 0 ? Number.parseInt(ahead.stdout.trim(), 10) : 0;
    const push = deps.exec('git', ['push']);
    if (push.status !== 0) {
      throw new Error(`Failed to push branch "${head}": ${push.stderr || push.stdout}`.trim());
    }

    return {
      status: aheadCount > 0 ? 'updated' : 'up-to-date',
      hasUpstream: true
    };
  }

  const push = deps.exec('git', ['push', '--set-upstream', 'origin', head]);
  if (push.status !== 0) {
    throw new Error(`Failed to push branch "${head}" with upstream: ${push.stderr || push.stdout}`.trim());
  }

  return {
    status: 'upstream-set',
    hasUpstream: false
  };
}

function createOrUpdatePr(context, body, args, deps) {
  const existing = findOpenPrByHeadBase(context.repo, context.head, context.base, deps);
  if (existing && !args.updateExistingPr) {
    return {
      action: 'reused',
      number: existing.number,
      url: existing.url
    };
  }

  const bodyFilePath = path.join(process.cwd(), `.tmp-pr-body-${Date.now()}.md`);
  fs.writeFileSync(bodyFilePath, body);

  try {
    if (existing) {
      const editArgs = ['pr', 'edit', String(existing.number), '--repo', context.repo, '--title', context.title, '--body-file', bodyFilePath];
      const edit = deps.exec('gh', editArgs);
      if (edit.status !== 0) {
        throw new Error(`Failed to update PR #${existing.number}: ${edit.stderr || edit.stdout}`.trim());
      }

      return {
        action: 'updated',
        number: existing.number,
        url: existing.url
      };
    }

    const createArgs = ['pr', 'create', '--repo', context.repo, '--head', context.head, '--base', context.base, '--title', context.title, '--body-file', bodyFilePath];
    if (args.draft) {
      createArgs.push('--draft');
    }
    const create = deps.exec('gh', createArgs);
    if (create.status !== 0) {
      throw new Error(`Failed to create PR: ${create.stderr || create.stdout}`.trim());
    }

    const url = (create.stdout || '').trim().split('\n').find((line) => line.includes('http')) || '';
    const created = findOpenPrByHeadBase(context.repo, context.head, context.base, deps);
    return {
      action: 'created',
      number: created ? created.number : 0,
      url: url || (created ? created.url : '')
    };
  } finally {
    if (fs.existsSync(bodyFilePath)) {
      fs.unlinkSync(bodyFilePath);
    }
  }
}

function enablePrAutoMerge(repo, prNumber, mergeMethod, deps) {
  const methodFlag = mergeMethod === 'merge'
    ? '--merge'
    : mergeMethod === 'rebase'
      ? '--rebase'
      : '--squash';
  const result = deps.exec('gh', ['pr', 'merge', String(prNumber), '--repo', repo, methodFlag, '--auto']);
  if (result.status !== 0) {
    throw new Error(`Failed to enable auto-merge for PR #${prNumber}: ${result.stderr || result.stdout}`.trim());
  }
}

function getPrCheckState(repo, prNumber, deps) {
  const result = deps.exec('gh', ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'statusCheckRollup,url,number']);
  if (result.status !== 0) {
    throw new Error(`Failed to inspect PR #${prNumber} checks: ${result.stderr || result.stdout}`.trim());
  }

  const parsed = parseJsonSafely(result.stdout || '{}', {});
  const rollup = Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : [];
  let pending = 0;
  let failed = 0;

  for (const item of rollup) {
    const rawState = String(item.conclusion || item.state || item.status || '').toUpperCase();
    if (!rawState || rawState === 'EXPECTED' || rawState === 'PENDING' || rawState === 'IN_PROGRESS' || rawState === 'QUEUED' || rawState === 'WAITING') {
      pending += 1;
      continue;
    }

    if (rawState === 'SUCCESS' || rawState === 'NEUTRAL' || rawState === 'SKIPPED') {
      continue;
    }

    failed += 1;
  }

  return {
    pending,
    failed,
    total: rollup.length
  };
}

function watchPrChecks(repo, prNumber, timeoutMinutes, deps) {
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  while (nowMs(deps) <= timeoutAt) {
    const state = getPrCheckState(repo, prNumber, deps);
    if (state.failed > 0) {
      throw new Error(`PR #${prNumber} has failing required checks.`);
    }

    if (state.pending === 0) {
      return 'green';
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  throw new Error(`Timed out waiting for checks on PR #${prNumber} after ${timeoutMinutes} minutes.`);
}

function mergePrWhenGreen(repo, prNumber, mergeMethod, deps) {
  const methodFlag = mergeMethod === 'merge'
    ? '--merge'
    : mergeMethod === 'rebase'
      ? '--rebase'
      : '--squash';
  const merge = deps.exec('gh', ['pr', 'merge', String(prNumber), '--repo', repo, methodFlag, '--delete-branch']);
  if (merge.status !== 0) {
    throw new Error(`Failed to merge PR #${prNumber}: ${merge.stderr || merge.stdout}`.trim());
  }
}

function getPrMergeReadiness(repo, prNumber, deps) {
  const view = deps.exec('gh', [
    'pr',
    'view',
    String(prNumber),
    '--repo',
    repo,
    '--json',
    'number,url,reviewDecision,mergeStateStatus,isDraft,headRefName'
  ]);
  if (view.status !== 0) {
    throw new Error(`Failed to inspect merge readiness for PR #${prNumber}: ${view.stderr || view.stdout}`.trim());
  }

  const parsed = parseJsonSafely(view.stdout || '{}', {});
  return {
    number: parsed.number || prNumber,
    url: parsed.url || '',
    reviewDecision: String(parsed.reviewDecision || '').toUpperCase(),
    mergeStateStatus: String(parsed.mergeStateStatus || '').toUpperCase(),
    isDraft: Boolean(parsed.isDraft),
    headRefName: String(parsed.headRefName || '')
  };
}

function getLatestWorkflowRunForBranch(repo, branch, deps) {
  if (!branch) {
    return null;
  }

  const runs = deps.exec('gh', [
    'run',
    'list',
    '--repo',
    repo,
    '--branch',
    branch,
    '--json',
    'databaseId,workflowName,status,conclusion,url,updatedAt,createdAt,event',
    '--limit',
    '10'
  ]);
  if (runs.status !== 0) {
    return null;
  }

  const parsed = parseJsonSafely(runs.stdout || '[]', []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  return parsed[0];
}

function getLatestMergedPrIntoBase(repo, baseBranch, deps) {
  if (!baseBranch) {
    return null;
  }

  const result = deps.exec('gh', [
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'merged',
    '--base',
    baseBranch,
    '--json',
    'number,url,mergedAt,headRefName',
    '--limit',
    '10'
  ]);
  if (result.status !== 0) {
    return null;
  }

  const parsed = parseJsonSafely(result.stdout || '[]', []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const merged = parsed
    .filter((item) => item && item.mergedAt)
    .sort((left, right) => Date.parse(String(right.mergedAt || '')) - Date.parse(String(left.mergedAt || '')));

  return merged[0] || null;
}

function shouldKeepWaitingForExternalWorkflowTrigger(repo, baseBranch, workflowBranch, deps) {
  const latestMergedPr = getLatestMergedPrIntoBase(repo, baseBranch, deps);
  if (!latestMergedPr || !latestMergedPr.mergedAt) {
    return false;
  }

  const mergedAtMs = Date.parse(String(latestMergedPr.mergedAt));
  if (!Number.isFinite(mergedAtMs)) {
    return false;
  }

  const elapsedSinceMergeMs = nowMs(deps) - mergedAtMs;
  if (elapsedSinceMergeMs < 0 || elapsedSinceMergeMs > RECENT_BASE_MERGE_GRACE_MS) {
    return false;
  }

  const workflowRun = getLatestWorkflowRunForBranch(repo, workflowBranch, deps);
  if (!workflowRun) {
    return true;
  }

  const workflowCreatedAtMs = Date.parse(String(workflowRun.createdAt || ''));
  if (Number.isFinite(workflowCreatedAtMs) && workflowCreatedAtMs >= mergedAtMs) {
    return false;
  }

  const workflowUpdatedAtMs = Date.parse(String(workflowRun.updatedAt || ''));
  if (Number.isFinite(workflowUpdatedAtMs) && workflowUpdatedAtMs >= mergedAtMs) {
    return false;
  }

  return true;
}

function getLatestReleaseWorkflowRunForBranch(repo, branch, deps) {
  const run = getLatestWorkflowRunForBranch(repo, branch, deps);
  if (!run) {
    return null;
  }

  const workflowName = String(run.workflowName || '').toLowerCase();
  if (!workflowName.includes('release')) {
    return null;
  }

  return run;
}

function buildWorkflowFailureMessage(repo, run, deps) {
  const lines = [
    'Release workflow failed before npm propagation could complete.',
    `workflow: ${run.workflowName || 'unknown'}`,
    `status: ${run.status || 'unknown'}`,
    `conclusion: ${run.conclusion || 'unknown'}`
  ];

  if (run.url) {
    lines.push(`url: ${run.url}`);
  }

  if (run.databaseId) {
    const failedLogs = deps.exec('gh', ['run', 'view', String(run.databaseId), '--repo', repo, '--log-failed']);
    if (failedLogs.status === 0 && String(failedLogs.stdout || '').trim()) {
      const snippet = String(failedLogs.stdout)
        .trim()
        .split('\n')
        .slice(0, 40)
        .join('\n');
      lines.push('', 'failed log excerpt:', snippet);
    }
  }

  return lines.join('\n');
}

function assertReleaseWorkflowHealthyOrThrow(repo, branch, deps) {
  const run = getLatestReleaseWorkflowRunForBranch(repo, branch, deps);
  if (!run) {
    return;
  }

  const completed = String(run.status || '').toLowerCase() === 'completed';
  const successfulConclusions = new Set(['success', 'neutral', 'skipped']);
  const conclusion = String(run.conclusion || '').toLowerCase();
  if (completed && !successfulConclusions.has(conclusion)) {
    throw new Error(buildWorkflowFailureMessage(repo, run, deps));
  }
}

function waitForPrMergeReadinessOrThrow(repo, prNumber, label, timeoutMinutes, deps, options = {}) {
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  let lastReadiness = null;
  let lastChecks = null;
  const allowBehindTransient = Boolean(options.allowBehindTransient);
  const expectWorkflowTrigger = Boolean(options.expectWorkflowTrigger);
  const triggerBaseBranch = String(options.triggerBaseBranch || '');
  let behindObservedAt = null;
  while (nowMs(deps) <= timeoutAt) {
    const mergeState = getPrMergeState(repo, prNumber, deps);
    if (mergeState.state === 'MERGED' || mergeState.mergedAt) {
      return {
        number: prNumber,
        url: '',
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'MERGED',
        isDraft: false
      };
    }

    const readiness = getPrMergeReadiness(repo, prNumber, deps);
    const checks = getPrCheckState(repo, prNumber, deps);
    lastReadiness = readiness;
    lastChecks = checks;

    if (readiness.isDraft) {
      throw new Error(`${label} is still a draft PR. Mark it ready for review before merge.`);
    }

    if (readiness.reviewDecision === 'REVIEW_REQUIRED' || readiness.reviewDecision === 'CHANGES_REQUESTED') {
      throw new Error(
        [
          `${label} still requires review approval before merge.`,
          `reviewDecision: ${readiness.reviewDecision}`,
          readiness.url ? `PR: ${readiness.url}` : ''
        ].filter(Boolean).join('\n')
      );
    }

    if (checks.failed > 0) {
      throw new Error(`${label} has failing required checks.`);
    }

    if (readiness.mergeStateStatus === 'DIRTY') {
      throw new Error(
        [
          `${label} is not mergeable yet due to branch policy/state.`,
          `mergeStateStatus: ${readiness.mergeStateStatus}`,
          readiness.url ? `PR: ${readiness.url}` : ''
        ].filter(Boolean).join('\n')
      );
    }

    if (readiness.mergeStateStatus === 'BEHIND') {
      if (allowBehindTransient) {
        const workflowRun = getLatestWorkflowRunForBranch(repo, readiness.headRefName, deps);
        const runStatus = String((workflowRun && workflowRun.status) || '').toLowerCase();
        const runConclusion = String((workflowRun && workflowRun.conclusion) || '').toLowerCase();
        const runCompleted = runStatus === 'completed';
        const runFailed = runCompleted && !['success', 'neutral', 'skipped'].includes(runConclusion);

        if (runFailed) {
          throw new Error(
            [
              `${label} stayed BEHIND because latest workflow run failed.`,
              `workflow: ${workflowRun.workflowName || 'unknown'}`,
              `status/conclusion: ${workflowRun.status || 'n/a'}/${workflowRun.conclusion || 'n/a'}`,
              workflowRun.url ? `run: ${workflowRun.url}` : '',
              readiness.url ? `PR: ${readiness.url}` : ''
            ].filter(Boolean).join('\n')
          );
        }

        const waitingForExternalTrigger = !expectWorkflowTrigger
          && shouldKeepWaitingForExternalWorkflowTrigger(repo, triggerBaseBranch, readiness.headRefName, deps);

        if (!expectWorkflowTrigger && !waitingForExternalTrigger) {
          if (behindObservedAt === null) {
            behindObservedAt = nowMs(deps);
          }

          const behindElapsedMs = nowMs(deps) - behindObservedAt;
          if (behindElapsedMs >= BEHIND_WITHOUT_TRIGGER_GRACE_MS) {
            throw new Error(
              [
                `${label} remained BEHIND for more than ${Math.floor(BEHIND_WITHOUT_TRIGGER_GRACE_MS / 1000)}s without a merge in this release run to trigger a new workflow.`,
                runCompleted ? `latest workflow conclusion: ${runConclusion || 'n/a'}` : 'latest workflow status: unavailable',
                workflowRun && workflowRun.url ? `run: ${workflowRun.url}` : '',
                readiness.url ? `PR: ${readiness.url}` : '',
                'If you just merged code outside this command, rerun release after the workflow starts updating the release PR.'
              ].filter(Boolean).join('\n')
            );
          }
        }

        waitForNextPoll(timeoutAt, 5000, deps);
        continue;
      }
      throw new Error(
        [
          `${label} is not mergeable yet due to branch policy/state.`,
          `mergeStateStatus: ${readiness.mergeStateStatus}`,
          readiness.url ? `PR: ${readiness.url}` : ''
        ].filter(Boolean).join('\n')
      );
    }

    const mergeStateReady = readiness.mergeStateStatus === 'CLEAN'
      || readiness.mergeStateStatus === 'HAS_HOOKS'
      || readiness.mergeStateStatus === 'UNSTABLE';
    const mergeStateUnknown = !readiness.mergeStateStatus || readiness.mergeStateStatus === 'UNKNOWN' || readiness.mergeStateStatus === 'BLOCKED';
    if ((mergeStateReady && checks.pending === 0) || (mergeStateUnknown && checks.pending === 0 && !readiness.mergeStateStatus)) {
      return readiness;
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  throw new Error(
    [
      `${label} did not become merge-ready after ${timeoutMinutes} minutes.`,
      `mergeStateStatus: ${lastReadiness ? (lastReadiness.mergeStateStatus || 'n/a') : 'n/a'}`,
      `reviewDecision: ${lastReadiness ? (lastReadiness.reviewDecision || 'n/a') : 'n/a'}`,
      `pending checks: ${lastChecks ? lastChecks.pending : 'n/a'}`,
      allowBehindTransient ? 'Hint: release PR can stay BEHIND while changeset workflow updates its branch. Wait for workflow completion and rerun if needed.' : '',
      lastReadiness && lastReadiness.url ? `PR: ${lastReadiness.url}` : ''
    ].filter(Boolean).join('\n')
  );
}

async function confirmMergeIfNeeded(args, readiness, label) {
  if (args.confirmMerges && !args.yes) {
    await confirmOrThrow(
      [
        `${label} is ready for merge.`,
        `reviewDecision: ${readiness.reviewDecision || 'n/a'}`,
        `mergeStateStatus: ${readiness.mergeStateStatus || 'n/a'}`,
        'Proceed with merge now?'
      ].join('\n')
    );
  }
}

function getPrMergeState(repo, prNumber, deps) {
  const view = deps.exec('gh', [
    'pr',
    'view',
    String(prNumber),
    '--repo',
    repo,
    '--json',
    'state,mergedAt'
  ]);
  if (view.status !== 0) {
    throw new Error(`Failed to read PR #${prNumber} merge state: ${view.stderr || view.stdout}`.trim());
  }

  const parsed = parseJsonSafely(view.stdout || '{}', {});
  return {
    state: String(parsed.state || '').toUpperCase(),
    mergedAt: parsed.mergedAt || ''
  };
}

function getPrMergeCommitSha(repo, prNumber, deps) {
  const view = deps.exec('gh', [
    'pr',
    'view',
    String(prNumber),
    '--repo',
    repo,
    '--json',
    'mergeCommit'
  ]);
  if (view.status !== 0) {
    return '';
  }

  const parsed = parseJsonSafely(view.stdout || '{}', {});
  const commit = parsed && parsed.mergeCommit ? parsed.mergeCommit : null;
  if (!commit) {
    return '';
  }
  if (typeof commit === 'string') {
    return commit;
  }
  if (typeof commit.oid === 'string') {
    return commit.oid;
  }
  if (typeof commit.id === 'string') {
    return commit.id;
  }
  return '';
}

function waitForPrMerged(repo, prNumber, timeoutMinutes, deps) {
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  while (nowMs(deps) <= timeoutAt) {
    const state = getPrMergeState(repo, prNumber, deps);
    if (state.state === 'MERGED' || state.mergedAt) {
      return true;
    }
    if (state.state === 'CLOSED') {
      throw new Error(`PR #${prNumber} was closed without merge.`);
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  throw new Error(`Timed out waiting for PR #${prNumber} merge after ${timeoutMinutes} minutes.`);
}

function releaseBaseBranchForTrack(track) {
  return track === 'stable' ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH;
}

function findReleasePrs(repo, deps, options = {}) {
  const expectedBase = options.expectedBase || '';
  const prs = listOpenPullRequests(repo, deps);
  return prs.filter(
    (item) => item.headRefName
      && item.headRefName.startsWith('changeset-release/')
      && (expectedBase
        ? item.baseRefName === expectedBase
        : (item.baseRefName === DEFAULT_BASE_BRANCH || item.baseRefName === DEFAULT_BETA_BRANCH))
  );
}

function waitForReleasePr(repo, timeoutMinutes, deps, options = {}) {
  const expectedBase = options.expectedBase || '';
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const progressIntervalMs = Number.isFinite(options.progressIntervalMs) ? options.progressIntervalMs : 30_000;
  const allowDirectPublish = Boolean(options.allowDirectPublish);
  const waitStartedAtMs = nowMs(deps);
  let lastProgressAt = 0;
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  while (nowMs(deps) <= timeoutAt) {
    const releasePrs = findReleasePrs(repo, deps, { expectedBase });
    if (releasePrs.length === 1) {
      return {
        type: 'release_pr',
        releasePr: releasePrs[0]
      };
    }
    if (releasePrs.length > 1) {
      throw new Error(`Multiple release PRs detected: ${releasePrs.map((item) => item.url).join(', ')}`);
    }

    if (allowDirectPublish) {
      const run = getLatestWorkflowRunForBranch(repo, DEFAULT_BETA_BRANCH, deps);
      if (run) {
        const updatedAtMs = run.updatedAt ? Date.parse(run.updatedAt) : 0;
        const recentlyUpdated = Number.isFinite(updatedAtMs) && updatedAtMs >= waitStartedAtMs;
        const completed = String(run.status || '').toLowerCase() === 'completed';
        const success = ['success', 'neutral', 'skipped'].includes(String(run.conclusion || '').toLowerCase());
        const looksLikeReleaseFlow = String(run.workflowName || '').toLowerCase().includes('release')
          || String(run.event || '').toLowerCase() === 'push';

        if (recentlyUpdated && completed && success && looksLikeReleaseFlow) {
          return {
            type: 'direct_publish',
            workflowRun: run
          };
        }
      }
    }

    const now = nowMs(deps);
    if (onProgress && (lastProgressAt === 0 || now - lastProgressAt >= progressIntervalMs)) {
      lastProgressAt = now;
      onProgress();
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  const baseHint = expectedBase ? ` targeting ${expectedBase}` : '';
  throw new Error(`Timed out waiting for release PR${baseHint} after ${timeoutMinutes} minutes.`);
}

async function confirmDetectedModeIfNeeded(args, mode, planText) {
  if (args.yes) {
    return;
  }

  await confirmOrThrow(
    [
      `release detected mode: ${mode}`,
      planText
    ].join('\n')
  );
}

function ghApiJson(deps, method, endpoint, payload) {
  const result = ghApi(deps, method, endpoint, payload);
  if (result.status !== 0) {
    throw new Error(`GitHub API ${method} ${endpoint} failed: ${result.stderr || result.stdout}`.trim());
  }

  return parseJsonSafely(result.stdout || '{}', {});
}

function dispatchPromoteStableWorkflow(repo, args, deps) {
  const endpoint = `/repos/${repo}/actions/workflows/${encodeURIComponent(DEFAULT_PROMOTE_WORKFLOW)}/dispatches`;
  const payload = {
    ref: args.head || DEFAULT_BETA_BRANCH,
    inputs: {
      promote_type: args.promoteType,
      summary: args.promoteSummary,
      target_beta_branch: DEFAULT_BETA_BRANCH
    }
  };
  ghApiJson(deps, 'POST', endpoint, payload);
}

function findPromotionPrs(repo, deps) {
  const prs = listOpenPullRequests(repo, deps);
  return prs.filter(
    (item) => item.baseRefName === DEFAULT_BETA_BRANCH
      && typeof item.headRefName === 'string'
      && item.headRefName.startsWith('promote/stable-')
  );
}

function waitForPromotionPr(repo, timeoutMinutes, deps) {
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  while (nowMs(deps) <= timeoutAt) {
    const promotionPrs = findPromotionPrs(repo, deps);
    if (promotionPrs.length === 1) {
      return promotionPrs[0];
    }

    if (promotionPrs.length > 1) {
      promotionPrs.sort((a, b) => b.number - a.number);
      return promotionPrs[0];
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  throw new Error(`Timed out waiting for promotion PR after ${timeoutMinutes} minutes.`);
}

function encodePathForGitHubContent(pathValue) {
  return String(pathValue || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getRemotePackageVersionFromPath(repo, ref, packageJsonPath, deps) {
  const safePath = encodePathForGitHubContent(packageJsonPath);
  const endpoint = `/repos/${repo}/contents/${safePath}?ref=${encodeURIComponent(ref)}`;
  const contentResponse = ghApiJson(deps, 'GET', endpoint);
  if (!contentResponse.content) {
    throw new Error(`Could not read ${packageJsonPath} content from ${repo}@${ref}.`);
  }

  const decoded = Buffer.from(String(contentResponse.content).replace(/\n/g, ''), 'base64').toString('utf8');
  const parsed = parseJsonSafely(decoded, {});
  if (!parsed.name || !parsed.version) {
    throw new Error(`${packageJsonPath} from ${repo}@${ref} must include name and version.`);
  }

  return {
    name: parsed.name,
    version: parsed.version,
    private: parsed.private === true,
    packageJsonPath
  };
}

function getRemotePackageVersion(repo, ref, deps) {
  return getRemotePackageVersionFromPath(repo, ref, 'package.json', deps);
}

function listPullRequestFiles(repo, prNumber, deps) {
  const files = ghApiJson(deps, 'GET', `/repos/${repo}/pulls/${prNumber}/files?per_page=100`);
  return Array.isArray(files) ? files : [];
}

function listRepoContents(repo, ref, dirPath, deps) {
  const safePath = encodePathForGitHubContent(dirPath || '');
  const endpoint = safePath
    ? `/repos/${repo}/contents/${safePath}?ref=${encodeURIComponent(ref)}`
    : `/repos/${repo}/contents?ref=${encodeURIComponent(ref)}`;
  const content = ghApiJson(deps, 'GET', endpoint);
  return Array.isArray(content) ? content : [];
}

function findWorkspacePackageJsonPaths(repo, ref, deps) {
  const root = getRemotePackageVersionFromPath(repo, ref, 'package.json', deps);
  const rootPackage = parseJsonSafely(
    Buffer.from(
      String(
        ghApiJson(deps, 'GET', `/repos/${repo}/contents/package.json?ref=${encodeURIComponent(ref)}`).content || ''
      ).replace(/\n/g, ''),
      'base64'
    ).toString('utf8'),
    {}
  );
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const paths = [];
  for (const workspace of workspaces) {
    if (!workspace.endsWith('/*')) {
      continue;
    }

    const prefix = workspace.slice(0, -2);
    const entries = listRepoContents(repo, ref, prefix, deps);
    for (const entry of entries) {
      if (entry && entry.type === 'dir' && entry.path) {
        paths.push(`${entry.path}/package.json`);
      }
    }
  }

  if (paths.length === 0) {
    return ['package.json'];
  }

  return [...new Set(paths)];
}

function resolveExpectedNpmPackagesFromRef(repo, targetRef, args, deps) {
  const explicitPackages = Array.isArray(args.npmPackages) ? args.npmPackages : [];
  const candidatePaths = findWorkspacePackageJsonPaths(repo, targetRef, deps);
  const resolved = [];
  for (const packageJsonPath of candidatePaths) {
    try {
      resolved.push(getRemotePackageVersionFromPath(repo, targetRef, packageJsonPath, deps));
    } catch (error) {
      // Ignore missing/invalid paths while scanning candidates.
    }
  }

  const publishable = resolved.filter((pkg) => pkg && pkg.name && pkg.version && pkg.private !== true);
  const byName = new Map(publishable.map((pkg) => [pkg.name, pkg]));

  if (explicitPackages.length > 0) {
    const missing = explicitPackages.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new Error(
        [
          `Could not resolve explicit --npm-package values from ${targetRef}: ${missing.join(', ')}`,
          `Discovered packages: ${[...byName.keys()].join(', ') || 'none'}`
        ].join('\n')
      );
    }

    return explicitPackages.map((name) => byName.get(name));
  }

  return publishable;
}

function resolveExpectedNpmPackages(repo, releasePrNumber, targetRef, expectedTag, args, deps) {
  if (!releasePrNumber) {
    const resolvedFromRef = resolveExpectedNpmPackagesFromRef(repo, targetRef, args, deps);
    if (resolvedFromRef.length > 0) {
      return resolvedFromRef;
    }

    return [getRemotePackageVersion(repo, targetRef, deps)];
  }

  const explicitPackages = Array.isArray(args.npmPackages) ? args.npmPackages : [];
  const files = listPullRequestFiles(repo, releasePrNumber, deps);
  const packageJsonPaths = [...new Set(
    files
      .filter((file) => file && file.status !== 'removed' && typeof file.filename === 'string')
      .map((file) => file.filename)
      .filter((fileName) => fileName.endsWith('/package.json') || fileName === 'package.json')
  )];

  const fallbackPaths = packageJsonPaths.length > 0 ? packageJsonPaths : ['package.json'];
  const resolved = fallbackPaths
    .map((filePath) => getRemotePackageVersionFromPath(repo, targetRef, filePath, deps))
    .filter((pkg) => pkg && pkg.name && pkg.version && pkg.private !== true);

  const byName = new Map();
  for (const pkg of resolved) {
    if (!byName.has(pkg.name)) {
      byName.set(pkg.name, pkg);
    }
  }

  if (explicitPackages.length === 0) {
    return [...byName.values()];
  }

  const filtered = [];
  const missing = [];
  for (const pkgName of explicitPackages) {
    if (byName.has(pkgName)) {
      filtered.push(byName.get(pkgName));
    } else {
      missing.push(pkgName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `Could not resolve expected npm package(s) from release PR #${releasePrNumber}: ${missing.join(', ')}`,
        `Resolved package names: ${[...byName.keys()].join(', ') || 'none'}`,
        `Expected tag: ${expectedTag}`
      ].join('\n')
    );
  }

  return filtered;
}

function validateNpmPublishedPackages(packageTargets, expectedTag, timeoutMinutes, deps) {
  const timeoutAt = nowMs(deps) + timeoutMinutes * 60 * 1000;
  const observations = {};
  const isStableTrack = expectedTag === 'latest';
  const onProgress = typeof deps.onNpmValidationProgress === 'function' ? deps.onNpmValidationProgress : null;
  let lastProgressAt = 0;

  while (nowMs(deps) <= timeoutAt) {
    let allPass = true;
    for (const target of packageTargets) {
      const versionResult = deps.exec('npm', ['view', target.name, 'version', '--json']);
      const tagsResult = deps.exec('npm', ['view', target.name, 'dist-tags', '--json']);
      let observedVersion = '';
      let observedTagVersion = '';
      if (versionResult.status === 0) {
        observedVersion = String(parseJsonSafely(versionResult.stdout || '""', '') || '');
      }
      if (tagsResult.status === 0) {
        const tags = parseJsonSafely(tagsResult.stdout || '{}', {});
        observedTagVersion = tags && tags[expectedTag] ? String(tags[expectedTag]) : '';
      }

      const versionMatches = isStableTrack ? observedVersion === target.version : true;
      const prereleaseFallbackMatches = !isStableTrack
        && !observedTagVersion
        && observedVersion === target.version
        && String(target.version).includes('-');
      const stableLatestFallbackMatches = !isStableTrack
        && !observedTagVersion
        && observedVersion === target.version
        && !String(target.version).includes('-');
      const tagMatches = observedTagVersion === target.version || prereleaseFallbackMatches || stableLatestFallbackMatches;
      const passed = versionMatches && tagMatches;
      let matchReason = '';
      if (observedTagVersion === target.version) {
        matchReason = 'tag_match';
      } else if (prereleaseFallbackMatches) {
        matchReason = 'prerelease_fallback';
      } else if (stableLatestFallbackMatches) {
        matchReason = 'stable_latest_fallback';
      }
      if (!passed) {
        allPass = false;
      }

      observations[target.name] = {
        name: target.name,
        expectedVersion: target.version,
        observedVersion,
        observedTagVersion,
        matchReason,
        passed
      };
    }

    if (allPass) {
      return {
        status: 'pass',
        observations
      };
    }

    const now = nowMs(deps);
    if (onProgress && (lastProgressAt === 0 || now - lastProgressAt >= 30_000)) {
      lastProgressAt = now;
      onProgress({
        expectedTag,
        observations
      });
    }

    waitForNextPoll(timeoutAt, 10000, deps);
  }

  return {
    status: 'timeout',
    observations
  };
}

function buildAdapterPrimitives(deps) {
  return {
    listOpenPullRequests(repo) {
      return listOpenPullRequests(repo, deps);
    },
    findReleaseCandidates({ repo, expectedBase }) {
      return findReleasePrs(repo, deps, { expectedBase });
    },
    getLatestWorkflowRunForBranch(repo, branch) {
      return getLatestWorkflowRunForBranch(repo, branch, deps);
    },
    resolveExpectedNpmPackages(repo, releasePrNumber, targetRef, expectedTag, args) {
      return resolveExpectedNpmPackages(repo, releasePrNumber, targetRef, expectedTag, args, deps);
    },
    validateNpmPublishedPackages(packageTargets, expectedTag, timeoutMinutes, options = {}) {
      return validateNpmPublishedPackages(packageTargets, expectedTag, timeoutMinutes, {
        ...deps,
        onNpmValidationProgress: options.onProgress
      });
    },
    assertReleaseWorkflowHealthyOrThrow(repo, branch) {
      return assertReleaseWorkflowHealthyOrThrow(repo, branch, deps);
    }
  };
}

function waitForAdapterReleaseCandidate({
  adapter,
  adapterContextFactory,
  timeoutMinutes,
  deps,
  onProgress,
  progressIntervalMs = 30_000
}) {
  const waitStartedAtMs = nowMs(deps);
  const timeoutAt = waitStartedAtMs + timeoutMinutes * 60 * 1000;
  let lastProgressAt = 0;

  while (nowMs(deps) <= timeoutAt) {
    const context = adapterContextFactory(waitStartedAtMs);
    const candidates = adapter.findReleaseCandidates(context) || [];
    const selected = adapter.selectReleaseCandidate(context, candidates);
    if (selected) {
      return selected;
    }

    const now = nowMs(deps);
    if (typeof onProgress === 'function' && (lastProgressAt === 0 || now - lastProgressAt >= progressIntervalMs)) {
      lastProgressAt = now;
      onProgress();
    }

    waitForNextPoll(timeoutAt, 5000, deps);
  }

  throw new Error(`Timed out waiting for release candidate after ${timeoutMinutes} minutes.`);
}

function ensureWorkingTreeClean(deps) {
  const status = deps.exec('git', ['status', '--porcelain']);
  if (status.status !== 0) {
    throw new Error('Failed to inspect working tree status.');
  }

  return status.stdout.trim() === '';
}

function isProtectedOrGeneratedBranch(branchName) {
  if (!branchName) {
    return true;
  }

  return branchName === DEFAULT_BASE_BRANCH
    || branchName === DEFAULT_BETA_BRANCH
    || branchName.startsWith('changeset-release/')
    || branchName.startsWith('promote/');
}

function isCleanupCandidateBranch(branchName) {
  if (!branchName) {
    return false;
  }

  return /^(feat|fix|chore|refactor|test)\//.test(branchName);
}

function syncBranchWithBase({
  deps,
  headBranch,
  baseBranch,
  strategy,
  reporter,
  summary,
  dryRun
}) {
  if (strategy === 'off') {
    summary.actionsSkipped.push('sync base branch');
    return {
      synchronized: false,
      wasBehind: false
    };
  }

  reporter.start('release-sync-fetch', `Fetching origin/${baseBranch}...`);
  const fetch = deps.exec('git', ['fetch', 'origin', baseBranch]);
  if (fetch.status !== 0) {
    throw new Error(`Failed to fetch origin/${baseBranch}: ${(fetch.stderr || fetch.stdout || '').trim()}`);
  }
  reporter.ok('release-sync-fetch', `Fetched origin/${baseBranch}.`);

  const behindCheck = deps.exec('git', ['rev-list', '--left-right', '--count', `${headBranch}...origin/${baseBranch}`]);
  if (behindCheck.status !== 0) {
    throw new Error(`Failed to compare ${headBranch} against origin/${baseBranch}.`);
  }

  const parts = (behindCheck.stdout || '').trim().split(/\s+/);
  const behindCount = Number.parseInt(parts[1] || '0', 10);
  const isBehind = Number.isInteger(behindCount) && behindCount > 0;
  if (!isBehind) {
    summary.actionsPerformed.push(`sync base: ${headBranch} already up to date with origin/${baseBranch}`);
    return {
      synchronized: true,
      wasBehind: false
    };
  }

  const effectiveStrategy = strategy === 'auto' ? 'rebase' : strategy;
  if (dryRun) {
    summary.actionsPerformed.push(`dry-run: would ${effectiveStrategy} ${headBranch} onto origin/${baseBranch}`);
    return {
      synchronized: false,
      wasBehind: true
    };
  }

  if (effectiveStrategy === 'rebase') {
    reporter.start('release-sync-rebase', `Rebasing ${headBranch} onto origin/${baseBranch}...`);
    const rebase = deps.exec('git', ['rebase', `origin/${baseBranch}`]);
    if (rebase.status !== 0) {
      throw new Error(
        [
          `Rebase failed while syncing ${headBranch} with origin/${baseBranch}.`,
          'Resolve conflicts, then run `git rebase --continue` or `git rebase --abort`.',
          (rebase.stderr || rebase.stdout || '').trim()
        ].filter(Boolean).join('\n')
      );
    }
    reporter.ok('release-sync-rebase', `${headBranch} rebased onto origin/${baseBranch}.`);
    summary.actionsPerformed.push(`sync base: rebased ${headBranch} onto origin/${baseBranch}`);
    return {
      synchronized: true,
      wasBehind: true
    };
  }

  reporter.start('release-sync-merge', `Merging origin/${baseBranch} into ${headBranch}...`);
  const merge = deps.exec('git', ['merge', '--no-edit', `origin/${baseBranch}`]);
  if (merge.status !== 0) {
    throw new Error(
      [
        `Merge failed while syncing ${headBranch} with origin/${baseBranch}.`,
        'Resolve conflicts and commit merge before rerunning.',
        (merge.stderr || merge.stdout || '').trim()
      ].filter(Boolean).join('\n')
    );
  }
  reporter.ok('release-sync-merge', `Merged origin/${baseBranch} into ${headBranch}.`);
  summary.actionsPerformed.push(`sync base: merged origin/${baseBranch} into ${headBranch}`);
  return {
    synchronized: true,
    wasBehind: true
  };
}

function isHeadIntegratedIntoBase(headRef, baseBranch, deps) {
  const fetch = deps.exec('git', ['fetch', 'origin', baseBranch]);
  if (fetch.status !== 0) {
    return false;
  }
  const ancestor = deps.exec('git', ['merge-base', '--is-ancestor', headRef, `origin/${baseBranch}`]);
  return ancestor.status === 0;
}

function runLocalCleanup({
  deps,
  originalBranch,
  targetBaseBranch,
  shouldRun,
  summary,
  reporter
}) {
  if (!shouldRun) {
    summary.actionsSkipped.push('cleanup');
    summary.cleanup = 'skipped';
    summary.warnings.push('Local cleanup skipped by configuration.');
    return;
  }

  if (!isCleanupCandidateBranch(originalBranch)) {
    summary.actionsSkipped.push('cleanup');
    summary.cleanup = 'skipped';
    summary.warnings.push(`Cleanup skipped: branch "${originalBranch}" is not an allowed code branch pattern.`);
    return;
  }

  if (isProtectedOrGeneratedBranch(originalBranch)) {
    summary.actionsSkipped.push('cleanup');
    summary.cleanup = 'skipped';
    summary.warnings.push(`Cleanup skipped: branch "${originalBranch}" is protected or generated.`);
    return;
  }

  if (!ensureWorkingTreeClean(deps)) {
    summary.actionsSkipped.push('cleanup');
    summary.cleanup = 'skipped';
    summary.warnings.push('Cleanup skipped: working tree is not clean.');
    return;
  }

  reporter.start('release-cleanup-checkout', `Checking out ${targetBaseBranch}...`);
  const checkout = deps.exec('git', ['checkout', targetBaseBranch]);
  if (checkout.status !== 0) {
    summary.cleanup = 'failed';
    summary.warnings.push(`Cleanup failed: could not checkout ${targetBaseBranch}: ${(checkout.stderr || checkout.stdout || '').trim()}`);
    reporter.warn('release-cleanup-checkout', `Could not checkout ${targetBaseBranch}.`);
    return;
  }
  reporter.ok('release-cleanup-checkout', `Checked out ${targetBaseBranch}.`);

  reporter.start('release-cleanup-pull', `Pulling latest ${targetBaseBranch}...`);
  const pull = deps.exec('git', ['pull']);
  if (pull.status !== 0) {
    summary.cleanup = 'failed';
    summary.warnings.push(`Cleanup warning: could not pull ${targetBaseBranch}: ${(pull.stderr || pull.stdout || '').trim()}`);
    reporter.warn('release-cleanup-pull', `Could not pull ${targetBaseBranch}.`);
  } else {
    reporter.ok('release-cleanup-pull', `Pulled ${targetBaseBranch}.`);
  }

  reporter.start('release-cleanup-delete', `Deleting local branch ${originalBranch}...`);
  const deleteResult = deps.exec('git', ['branch', '-d', originalBranch]);
  if (deleteResult.status !== 0) {
    summary.cleanup = 'failed';
    summary.warnings.push(`Cleanup warning: could not delete ${originalBranch}: ${(deleteResult.stderr || deleteResult.stdout || '').trim()}`);
    reporter.warn('release-cleanup-delete', `Could not delete ${originalBranch}.`);
  } else {
    summary.actionsPerformed.push(`cleanup deleted branch: ${originalBranch}`);
    summary.cleanup = 'completed';
    reporter.ok('release-cleanup-delete', `Deleted ${originalBranch}.`);
  }
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

function ensureCreateOnlyFromTemplate(targetPath, templatePath, options) {
  if (fs.existsSync(targetPath)) {
    return 'skipped';
  }

  return ensureFileFromTemplate(targetPath, templatePath, options);
}

function appendGitignoreTemplate(targetPath, templatePath, options) {
  if (!fs.existsSync(targetPath)) {
    return ensureFileFromTemplate(targetPath, templatePath, options);
  }

  const currentRaw = fs.readFileSync(targetPath, 'utf8');
  const templateRaw = fs.readFileSync(templatePath, 'utf8');
  const currentSet = new Set(
    currentRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const missingLines = templateRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !currentSet.has(line));

  if (!missingLines.length) {
    return 'skipped';
  }

  if (options.dryRun) {
    return 'updated';
  }

  const needsSeparator = currentRaw.length > 0 && !currentRaw.endsWith('\n');
  const prefix = needsSeparator ? '\n' : '';
  fs.appendFileSync(targetPath, `${prefix}${missingLines.join('\n')}\n`);
  return 'updated';
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

    let result;
    if (targetRelativePath === '.gitignore') {
      result = appendGitignoreTemplate(targetPath, templatePath, {
        force: options.force,
        dryRun: options.dryRun,
        variables: options.variables
      });
    } else if (INIT_CREATE_ONLY_FILES.has(targetRelativePath)) {
      result = ensureCreateOnlyFromTemplate(targetPath, templatePath, {
        force: options.force,
        dryRun: options.dryRun,
        variables: options.variables
      });
    } else {
      result = ensureFileFromTemplate(targetPath, templatePath, {
        force: options.force,
        dryRun: options.dryRun,
        variables: options.variables
      });
    }

    if (result === 'created') {
      summary.createdFiles.push(targetRelativePath);
    } else if (result === 'overwritten' || result === 'updated') {
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

function sanitizeFirebaseProjectId(raw) {
  const normalized = String(raw || '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'your-firebase-project-id';
}

function mergeMissingConfig(existing, defaults, force = false) {
  if (Array.isArray(defaults)) {
    if (force || !Array.isArray(existing) || existing.length === 0) {
      return [...defaults];
    }
    return existing;
  }
  if (!defaults || typeof defaults !== 'object') {
    if (force || existing === undefined) {
      return defaults;
    }
    return existing;
  }

  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing }
    : {};

  for (const [key, value] of Object.entries(defaults)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = mergeMissingConfig(base[key], value, force);
      continue;
    }

    if (Array.isArray(value)) {
      if (force || !Array.isArray(base[key]) || base[key].length === 0) {
        base[key] = [...value];
      }
      continue;
    }

    if (force || base[key] === undefined || base[key] === null || base[key] === '') {
      base[key] = value;
    }
  }

  return base;
}

function buildInitShipConfig(args, packageName) {
  if (args.adapter === 'firebase') {
    const repoName = typeof args.repo === 'string' && args.repo.includes('/')
      ? args.repo.split('/')[1]
      : packageName;
    return {
      adapter: 'firebase',
      baseBranch: 'develop',
      productionBranch: args.defaultBranch || DEFAULT_BASE_BRANCH,
      betaBranch: args.betaBranch || DEFAULT_BETA_BRANCH,
      releaseTargets: ['firebase'],
      releasePolicy: {
        stopOnError: true
      },
      firebase: {
        projectId: sanitizeFirebaseProjectId(repoName || packageName),
        environments: ['local', 'staging', 'production']
      },
      deploy: {
        workflow: 'deploy-staging.yml'
      },
      environment: 'staging'
    };
  }

  return {
    adapter: 'npm',
    baseBranch: args.defaultBranch || DEFAULT_BASE_BRANCH,
    betaBranch: args.betaBranch || DEFAULT_BETA_BRANCH,
    releaseTargets: ['npm'],
    releasePolicy: {
      stopOnError: true
    }
  };
}

function ensureShipConfigFile(targetDir, args, packageName, summary, reporter) {
  const shipConfigPath = path.join(targetDir, '.ship.json');
  const desiredConfig = buildInitShipConfig(args, packageName);
  const exists = fs.existsSync(shipConfigPath);

  if (args.dryRun) {
    const dryAction = exists ? (args.force ? 'overwritten' : 'updated') : 'created';
    if (dryAction === 'created') {
      summary.createdFiles.push('.ship.json');
    } else {
      summary.overwrittenFiles.push('.ship.json');
    }
    reporter.warn('ship-config', `Dry-run enabled; .ship.json would be ${dryAction}.`);
    return;
  }

  let nextConfig = desiredConfig;
  if (exists) {
    const existingConfig = readJsonFile(shipConfigPath);
    nextConfig = mergeMissingConfig(existingConfig, desiredConfig, args.force);
  }

  writeJsonFile(shipConfigPath, nextConfig);
  if (!exists) {
    summary.createdFiles.push('.ship.json');
    reporter.ok('ship-config', '.ship.json created.');
  } else {
    summary.overwrittenFiles.push('.ship.json');
    reporter.ok('ship-config', args.force ? '.ship.json overwritten (--force).' : '.ship.json updated with missing fields.');
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
    'beta:promote': 'ship promote-stable --dir .'
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
      SCOPE: deriveScope(options.scope, packageName),
      ...buildReleaseAuthVariables(options.releaseAuth || DEFAULT_RELEASE_AUTH)
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
    SCOPE: deriveScope('', args.name),
    ...buildReleaseAuthVariables(args.releaseAuth || DEFAULT_RELEASE_AUTH)
  });

  summary.createdFiles.push(...createdFiles);

  summary.updatedScriptKeys.push('check', 'changeset', 'version-packages', 'release');
  summary.updatedScriptKeys.push('beta:enter', 'beta:exit', 'beta:version', 'beta:publish', 'beta:promote');
  summary.updatedScriptKeys.push(`release.auth:${args.releaseAuth}`);
  summary.updatedDependencyKeys.push(CHANGESETS_DEP);
  appendReleaseAuthWarnings(summary, args.releaseAuth);

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
  await resolveReleaseAuthSelection(args, overallSummary, { contextLabel: 'Select release auth mode for release workflow' });
  overallSummary.updatedScriptKeys.push(`release.auth:${args.releaseAuth}`);

  if (!selections.withGithub && !selections.withNpm && !selections.withBeta && !process.stdin.isTTY) {
    overallSummary.warnings.push('No --with-* flags were provided in non-interactive mode. Only local init was applied.');
  }

  const context = prevalidateInitExecution(args, selections, dependencies, reporter);
  appendReleaseAuthWarnings(overallSummary, args.releaseAuth, {
    missingAppSecrets: context.missingReleaseAuthAppSecrets,
    appSecretsChecked: selections.withGithub && args.releaseAuth === 'app'
  });
  await confirmInitPlan(args, selections, context, overallSummary);

  reporter.start('local-init', 'Applying local package bootstrap...');
  const localSummary = configureExistingPackage(targetDir, templateDir, {
    ...args,
    dryRun: args.dryRun,
    betaBranch: args.betaBranch
  });
  mergeSummary(overallSummary, localSummary);
  reporter.ok('local-init', args.dryRun ? 'Local package bootstrap previewed.' : 'Local package bootstrap applied.');

  reporter.start('ship-config', 'Ensuring .ship.json configuration...');
  ensureShipConfigFile(targetDir, args, context.packageName, overallSummary, reporter);

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
        scope: deriveScope(args.scope, context.packageName),
        releaseAuth: args.releaseAuth
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

  reporter.start('npm-install-final', 'Running npm install...');
  if (args.dryRun) {
    overallSummary.warnings.push(`dry-run: would run "npm install" in ${targetDir}`);
    reporter.warn('npm-install-final', 'Dry-run enabled; npm install was not executed.');
  } else {
    const install = deps.exec('npm', ['install'], { cwd: targetDir, stdio: 'inherit' });
    if (install.status !== 0) {
      reporter.fail('npm-install-final', 'npm install failed.');
      throw new Error(`Failed to run npm install in ${targetDir}.`);
    }
    reporter.ok('npm-install-final', 'npm install completed.');
    overallSummary.updatedDependencyKeys.push('npm.install');
  }

  printSummary(`Project initialized in ${targetDir}`, overallSummary);
}

function execCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });
}

async function runCodePrFlow(args, dependencies = {}, config = {}) {
  const deps = {
    exec: dependencies.exec || execCommand
  };
  const summary = createOrchestrationSummary();
  const reporter = new StepReporter();

  reporter.start('code-pr-preflight-gh', 'Validating GitHub CLI and authentication...');
  ensureGhAvailable(deps);
  reporter.ok('code-pr-preflight-gh', 'GitHub CLI available and authenticated.');

  reporter.start('code-pr-preflight-git', 'Resolving git context...');
  const context = resolveGitContext(args, deps);
  reporter.ok('code-pr-preflight-git', `Using ${context.head} -> ${context.base} in ${context.repo}.`);
  summary.modeDetected = 'code';
  summary.repoResolved = context.repo;

  const generatedBody = renderPrBodyDeterministic(context, deps, {
    cwd: process.cwd(),
    body: args.body,
    bodyFile: args.bodyFile,
    template: args.template
  });

  const shouldPrintSummary = args.printSummary !== false;

  if (args.dryRun) {
    summary.branchPushed = `dry-run: would push ${context.head}`;
    summary.prAction = `dry-run: would create/update PR ${context.head} -> ${context.base}`;
    summary.prUrl = 'dry-run';
    summary.autoMerge = args.autoMerge ? 'dry-run: would enable auto-merge' : 'skipped';
    summary.checks = args.watchChecks ? `dry-run: would watch checks (${args.checkTimeout}m)` : 'skipped';
    summary.merge = 'skipped';
    summary.releasePr = 'skipped';
    summary.actionsPerformed.push('rendered deterministic PR body', 'prepared push/create/update plan');
    if (!args.body && !args.bodyFile && !args.template) {
      summary.warnings.push('No body inputs provided; deterministic generated body would be used.');
    }
    if (shouldPrintSummary) {
      printOrchestrationSummary(`release code dry-run for ${context.repo}`, summary);
    }
    return {
      summary,
      context,
      pr: null
    };
  }

  if (args.skipPush) {
    summary.branchPushed = `skipped (${context.head})`;
    summary.actionsSkipped.push(`push skipped: ${context.head}`);
  } else {
    reporter.start('code-pr-push', `Pushing branch "${context.head}"...`);
    const pushResult = ensureBranchPushed(context.repo, context.head, deps);
    reporter.ok('code-pr-push', `Branch "${context.head}" pushed (${pushResult.status}).`);
    summary.branchPushed = `${context.head} (${pushResult.status})`;
    summary.actionsPerformed.push(`branch pushed: ${context.head}`);
    if (pushResult.status === 'up-to-date') {
      summary.warnings.push(`Branch "${context.head}" had no new commits to push.`);
    }
  }

  reporter.start('code-pr-upsert', 'Creating or updating pull request...');
  const prResult = createOrUpdatePr(context, generatedBody, args, deps);
  reporter.ok('code-pr-upsert', `PR ${prResult.action}: #${prResult.number}`);
  if (args.taskId) {
    attachTaskPrReference(args.taskId, prResult.number, config, process.cwd(), { dryRun: args.dryRun });
  }
  summary.prAction = `${prResult.action} (#${prResult.number})`;
  summary.prUrl = prResult.url || 'n/a';
  summary.actionsPerformed.push(`pr ${prResult.action}: #${prResult.number}`);
  if (prResult.action === 'reused') {
    summary.warnings.push('Existing PR reused without body/title changes. Use --update-pr-description to refresh PR content.');
  }

  if (args.autoMerge) {
    reporter.start('code-pr-auto-merge', `Enabling auto-merge for PR #${prResult.number}...`);
    enablePrAutoMerge(context.repo, prResult.number, args.mergeMethod || 'merge', deps);
    reporter.ok('code-pr-auto-merge', `Auto-merge enabled for PR #${prResult.number}.`);
    summary.autoMerge = 'enabled';
    summary.actionsPerformed.push(`auto-merge enabled for #${prResult.number}`);
  } else {
    summary.autoMerge = 'skipped';
    summary.actionsSkipped.push('auto-merge');
  }

  if (args.watchChecks) {
    reporter.start('code-pr-checks', `Watching checks for PR #${prResult.number}...`);
    watchPrChecks(context.repo, prResult.number, args.checkTimeout, deps);
    reporter.ok('code-pr-checks', `Checks green for PR #${prResult.number}.`);
    summary.checks = 'green';
    summary.actionsPerformed.push(`checks watched for #${prResult.number}`);
  } else {
    summary.checks = 'skipped';
    summary.actionsSkipped.push('watch-checks');
  }

  if (!args.body && !args.bodyFile && !args.template) {
    summary.warnings.push('PR body used deterministic generated markdown (no body/template inputs).');
  }
  summary.merge = 'skipped';
  summary.releasePr = 'skipped';
  if (shouldPrintSummary) {
    printOrchestrationSummary(`release code completed for ${context.repo}`, summary);
  }

  return {
    summary,
    context,
    pr: prResult
  };
}

async function runReleaseCycle(args, dependencies = {}, adapter = npmAdapter, config = {}) {
  const deps = {
    ...dependencies,
    exec: dependencies.exec || execCommand
  };
  validateAdapterForCapability(adapter, 'release');
  requireAdapterMethod(adapter, 'detectReleaseMode');
  requireAdapterMethod(adapter, 'resolveReleaseContext');
  requireAdapterMethod(adapter, 'findReleaseCandidates');
  requireAdapterMethod(adapter, 'selectReleaseCandidate');
  requireAdapterMethod(adapter, 'verifyPostMerge');
  const primitives = buildAdapterPrimitives(deps);
  const summary = createOrchestrationSummary();
  const reporter = new StepReporter();
  const originalBranch = deps.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const useAutoMerge = args.autoMerge;
  let triggeredBaseWorkflowThisRun = false;

  reporter.start('release-preflight-gh', 'Validating GitHub CLI and authentication...');
  ensureGhAvailable(deps);
  reporter.ok('release-preflight-gh', 'GitHub CLI available and authenticated.');

  const gitContext = resolveGitContext(args, deps);
  summary.repoResolved = gitContext.repo;
  const effectivePhase = args.phase;
  const requestedTrack = args.track === 'auto' ? (args.promoteStable ? 'stable' : 'beta') : args.track;
  if (args.promoteStable && gitContext.head !== DEFAULT_BETA_BRANCH) {
    throw new Error(`--promote-stable is only allowed when running from "${DEFAULT_BETA_BRANCH}".`);
  }
  if (requestedTrack === 'stable' && !args.promoteStable) {
    throw new Error('Stable track requires --promote-stable for explicit promotion.');
  }
  if (gitContext.head !== DEFAULT_BETA_BRANCH && requestedTrack === 'stable') {
    throw new Error(`Stable track is only supported from "${DEFAULT_BETA_BRANCH}".`);
  }
  summary.actionsPerformed.push(`release track: ${requestedTrack}`);
  const releaseContext = typeof adapter.resolveReleaseContext === 'function'
    ? adapter.resolveReleaseContext({
      args,
      config,
      gitContext,
      constants: {
        DEFAULT_BASE_BRANCH,
        DEFAULT_BETA_BRANCH
      }
    }) || {}
    : {};
  const effectiveReleaseContext = {
    track: releaseContext.track || requestedTrack,
    expectedTag: releaseContext.expectedTag || (requestedTrack === 'stable' ? 'latest' : 'beta'),
    targetBaseBranch: releaseContext.targetBaseBranch || releaseBaseBranchForTrack(requestedTrack),
    expectedReleasePrBase: releaseContext.expectedReleasePrBase || releaseBaseBranchForTrack(requestedTrack),
    workflowBranch: releaseContext.workflowBranch || (requestedTrack === 'stable' ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH),
    allowDirectPublish: releaseContext.allowDirectPublish !== false
  };
  summary.releaseTrack = effectiveReleaseContext.track;
  let detectedMode = args.mode;
  if (typeof adapter.detectReleaseMode === 'function') {
    detectedMode = adapter.detectReleaseMode({
      args,
      config,
      gitContext,
      releaseContext: effectiveReleaseContext,
      primitives,
      constants: {
        DEFAULT_BASE_BRANCH,
        DEFAULT_BETA_BRANCH
      }
    });
  } else if (detectedMode === 'auto') {
    detectedMode = 'code';
  }
  summary.modeDetected = detectedMode;

  await confirmDetectedModeIfNeeded(
    args,
    detectedMode,
    detectedMode === 'code'
      ? 'Will create/update code PR, watch checks, merge, then process release candidate.'
      : 'Will operate on release candidate PR, watch checks, and merge when green.'
  );

  if (detectedMode === 'code') {
    if (args.promoteStable) {
      reporter.start('release-promote-dispatch', `Dispatching ${DEFAULT_PROMOTE_WORKFLOW}...`);
      if (args.dryRun) {
        reporter.warn('release-promote-dispatch', `Dry-run: would dispatch ${DEFAULT_PROMOTE_WORKFLOW}.`);
        summary.actionsPerformed.push(`dry-run: dispatch ${DEFAULT_PROMOTE_WORKFLOW}`);
        summary.promotionWorkflow = `dry-run: ${DEFAULT_PROMOTE_WORKFLOW}`;
      } else {
        dispatchPromoteStableWorkflow(gitContext.repo, {
          ...args,
          head: DEFAULT_BETA_BRANCH
        }, deps);
        reporter.ok('release-promote-dispatch', `Dispatched ${DEFAULT_PROMOTE_WORKFLOW}.`);
        summary.actionsPerformed.push(`promotion workflow dispatched: ${DEFAULT_PROMOTE_WORKFLOW}`);
        summary.promotionWorkflow = `dispatched: ${DEFAULT_PROMOTE_WORKFLOW}`;
      }

      if (!args.dryRun) {
        reporter.start('release-promote-pr', 'Waiting for promotion PR...');
        const promotionPr = waitForPromotionPr(gitContext.repo, args.releasePrTimeout, deps);
        reporter.ok('release-promote-pr', `Promotion PR found: #${promotionPr.number}`);
        summary.actionsPerformed.push(`promotion pr discovered: #${promotionPr.number}`);
        summary.promotionPr = `found (#${promotionPr.number})`;

        if (args.watchChecks) {
          reporter.start('release-promote-checks', `Watching promotion PR checks #${promotionPr.number}...`);
          watchPrChecks(gitContext.repo, promotionPr.number, args.checkTimeout, deps);
          reporter.ok('release-promote-checks', `Promotion PR checks green (#${promotionPr.number}).`);
        }

        if (args.mergeWhenGreen) {
          reporter.start('release-promote-merge', `Merging promotion PR #${promotionPr.number}...`);
          mergePrWhenGreen(gitContext.repo, promotionPr.number, args.mergeMethod, deps);
          reporter.ok('release-promote-merge', `Promotion PR #${promotionPr.number} merged.`);
          summary.actionsPerformed.push(`promotion pr merged: #${promotionPr.number}`);
          summary.promotionPr = `merged (#${promotionPr.number})`;
          triggeredBaseWorkflowThisRun = true;
        }

        reporter.start('release-sync-beta', `Syncing local ${DEFAULT_BETA_BRANCH} branch...`);
        const checkoutBeta = deps.exec('git', ['checkout', DEFAULT_BETA_BRANCH]);
        if (checkoutBeta.status !== 0) {
          throw new Error(`Could not checkout ${DEFAULT_BETA_BRANCH}: ${(checkoutBeta.stderr || checkoutBeta.stdout || '').trim()}`);
        }
        const pullBeta = deps.exec('git', ['pull']);
        if (pullBeta.status !== 0) {
          throw new Error(`Could not pull ${DEFAULT_BETA_BRANCH}: ${(pullBeta.stderr || pullBeta.stdout || '').trim()}`);
        }
        reporter.ok('release-sync-beta', `${DEFAULT_BETA_BRANCH} synced.`);
      }
    } else {
      summary.promotionWorkflow = 'skipped';
      summary.promotionPr = 'skipped';
    }

    const canResumeFromMergedCode = args.resume
      && !args.promoteStable
      && gitContext.head !== DEFAULT_BETA_BRANCH
      && !gitContext.head.startsWith('changeset-release/')
      && isHeadIntegratedIntoBase('HEAD', effectiveReleaseContext.targetBaseBranch, deps);

    let codePr = null;
    let codeMergeSatisfied = false;
    if (canResumeFromMergedCode) {
      summary.prAction = 'skipped (resume: code already merged)';
      summary.prUrl = 'n/a';
      summary.branchPushed = 'skipped (resume)';
      summary.autoMerge = 'skipped (resume)';
      summary.checks = 'skipped (resume)';
      summary.merge = 'skipped (resume: already merged)';
      summary.actionsPerformed.push(`resume detected: ${gitContext.head} already integrated into ${DEFAULT_BETA_BRANCH}`);
      summary.actionsSkipped.push('open/update code pr (resume)');
      codeMergeSatisfied = true;
    } else {
      if (!args.promoteStable && gitContext.head !== DEFAULT_BETA_BRANCH && !gitContext.head.startsWith('changeset-release/')) {
        syncBranchWithBase({
          deps,
          headBranch: gitContext.head,
          baseBranch: effectiveReleaseContext.targetBaseBranch,
          strategy: args.syncBase,
          reporter,
          summary,
          dryRun: args.dryRun
        });
      }

      const codePrResult = await runCodePrFlow(
        {
          ...args,
          head: args.promoteStable ? DEFAULT_BETA_BRANCH : args.head,
          base: args.promoteStable ? DEFAULT_BASE_BRANCH : (args.base || effectiveReleaseContext.targetBaseBranch),
          autoMerge: useAutoMerge,
          watchChecks: args.watchChecks,
          checkTimeout: args.checkTimeout,
          mergeMethod: args.mergeMethod,
          updateExistingPr: args.updatePrDescription || effectivePhase === 'code',
          skipPush: args.promoteStable,
          printSummary: false
        },
        dependencies,
        config
      );

      codePr = codePrResult.pr;
      summary.prAction = codePrResult.summary.prAction;
      summary.prUrl = codePrResult.summary.prUrl;
      summary.branchPushed = codePrResult.summary.branchPushed;
      summary.autoMerge = codePrResult.summary.autoMerge;
      summary.checks = codePrResult.summary.checks;
      summary.actionsPerformed.push(...codePrResult.summary.actionsPerformed);
      summary.actionsSkipped.push(...codePrResult.summary.actionsSkipped);
      summary.warnings.push(...codePrResult.summary.warnings);

      if (args.mergeWhenGreen && codePr && !args.dryRun) {
        reporter.start('release-merge-code-ready', `Checking merge readiness for code PR #${codePr.number}...`);
        const codeReadiness = waitForPrMergeReadinessOrThrow(
          gitContext.repo,
          codePr.number,
          `Code PR #${codePr.number}`,
          args.checkTimeout,
          deps
        );
        await confirmMergeIfNeeded(args, codeReadiness, `Code PR #${codePr.number}`);
        reporter.ok('release-merge-code-ready', `Code PR #${codePr.number} is ready for merge.`);
        if (codePrResult.summary.autoMerge !== 'enabled') {
          reporter.start('release-code-auto-merge', `Enabling auto-merge for code PR #${codePr.number}...`);
          enablePrAutoMerge(gitContext.repo, codePr.number, args.mergeMethod, deps);
          reporter.ok('release-code-auto-merge', `Auto-merge enabled for code PR #${codePr.number}.`);
        } else {
          reporter.warn('release-code-auto-merge', `Auto-merge already enabled for code PR #${codePr.number}; skipping duplicate enable.`);
        }
        reporter.start('release-wait-code-merge', `Waiting for code PR #${codePr.number} merge...`);
        waitForPrMerged(gitContext.repo, codePr.number, args.releasePrTimeout, deps);
        reporter.ok('release-wait-code-merge', `Code PR #${codePr.number} merged.`);
        summary.actionsPerformed.push(`code pr merged: #${codePr.number}`);
        triggeredBaseWorkflowThisRun = true;
        if (args.taskId) {
          const mergeCommit = getPrMergeCommitSha(gitContext.repo, codePr.number, deps);
          markTaskMerged(args.taskId, mergeCommit, config, process.cwd(), { dryRun: args.dryRun });
        }
        summary.merge = `code pr merged (#${codePr.number})`;
        codeMergeSatisfied = true;
      } else {
        summary.merge = args.dryRun ? 'dry-run: would merge code PR' : 'skipped';
        summary.actionsSkipped.push('merge code pr');
      }
    }

    if (effectivePhase === 'code') {
      summary.releasePr = 'skipped (phase=code)';
      summary.npmValidation = 'skipped (phase=code)';
      summary.actionsSkipped.push('wait release pr (phase=code)');
      summary.actionsSkipped.push('verify npm (phase=code)');
      if (!args.dryRun && codeMergeSatisfied) {
        if (args.confirmCleanup && !args.yes) {
          await confirmOrThrow('Code PR flow completed and the branch is already merged.\nProceed with local cleanup now?');
        }
        runLocalCleanup({
          deps,
          originalBranch,
          targetBaseBranch: effectiveReleaseContext.targetBaseBranch,
          shouldRun: args.cleanup,
          summary,
          reporter
        });
      } else if (args.dryRun) {
        summary.cleanup = 'skipped (dry-run)';
      } else {
        summary.actionsSkipped.push('cleanup (code phase merge not completed)');
        summary.cleanup = 'skipped (requires code PR merge)';
      }
      printOrchestrationSummary(`release completed in ${detectedMode} mode`, summary);
      return;
    }

    let releaseCandidate = null;
    if (args.waitReleasePr) {
      if (args.dryRun) {
        summary.releasePr = `dry-run: would wait release candidate (${args.releasePrTimeout}m)`;
      } else {
        reporter.start('release-wait-release-pr', 'Waiting for release candidate...');
        releaseCandidate = waitForAdapterReleaseCandidate({
          adapter,
          deps,
          timeoutMinutes: args.releasePrTimeout,
          adapterContextFactory: (waitStartedAtMs) => ({
            args,
            config,
            deps,
            gitContext,
            releaseContext: effectiveReleaseContext,
            waitStartedAtMs,
            primitives,
            constants: {
              DEFAULT_BASE_BRANCH,
              DEFAULT_BETA_BRANCH
            }
          }),
          onProgress: () => {
            const run = primitives.getLatestWorkflowRunForBranch(gitContext.repo, effectiveReleaseContext.workflowBranch);
            if (!run) {
              logStep('run', `Still waiting release candidate... no workflow runs found yet on ${effectiveReleaseContext.workflowBranch}.`);
              return;
            }
            logStep(
              'run',
              `Still waiting release candidate... workflow "${run.workflowName || 'unknown'}" is ${run.status || 'unknown'}${run.conclusion ? ` (${run.conclusion})` : ''}.`
            );
          }
        });
        if (releaseCandidate.type === 'release_pr') {
          const releasePr = releaseCandidate.releasePr;
          reporter.ok('release-wait-release-pr', `Release PR found: #${releasePr.number}`);
          summary.releasePr = `found (#${releasePr.number})`;
          summary.actionsPerformed.push(`release pr discovered: #${releasePr.number}`);

          if (args.watchChecks) {
            reporter.start('release-watch-release-checks', `Watching release PR checks #${releasePr.number}...`);
            watchPrChecks(gitContext.repo, releasePr.number, args.checkTimeout, deps);
            reporter.ok('release-watch-release-checks', `Release PR checks green (#${releasePr.number}).`);
          }

          if (args.mergeReleasePr) {
            reporter.start('release-merge-release-ready', `Checking merge readiness for release PR #${releasePr.number}...`);
            const releaseReadiness = waitForPrMergeReadinessOrThrow(
              gitContext.repo,
              releasePr.number,
              `Release PR #${releasePr.number}`,
              args.checkTimeout,
              deps,
              {
                allowBehindTransient: true,
                expectWorkflowTrigger: triggeredBaseWorkflowThisRun,
                triggerBaseBranch: effectiveReleaseContext.targetBaseBranch
              }
            );
            await confirmMergeIfNeeded(args, releaseReadiness, `Release PR #${releasePr.number}`);
            reporter.ok('release-merge-release-ready', `Release PR #${releasePr.number} is ready for merge.`);
            reporter.start('release-release-auto-merge', `Enabling auto-merge for release PR #${releasePr.number}...`);
            enablePrAutoMerge(gitContext.repo, releasePr.number, args.mergeMethod, deps);
            reporter.ok('release-release-auto-merge', `Auto-merge enabled for release PR #${releasePr.number}.`);
            reporter.start('release-release-wait-merge', `Waiting for release PR #${releasePr.number} merge...`);
            waitForPrMerged(gitContext.repo, releasePr.number, args.releasePrTimeout, deps);
            reporter.ok('release-release-wait-merge', `Release PR #${releasePr.number} merged.`);
            summary.releasePr = `merged (#${releasePr.number})`;
            summary.actionsPerformed.push(`release pr merged: #${releasePr.number}`);
            if (args.taskId) {
              const mergeCommit = getPrMergeCommitSha(gitContext.repo, releasePr.number, deps);
              markTaskMerged(args.taskId, mergeCommit, config, process.cwd(), { dryRun: args.dryRun });
            }
            summary.autoMerge = 'enabled (code + release)';
            releaseCandidate = {
              type: 'release_pr',
              releasePr
            };
          } else {
            summary.actionsSkipped.push('merge release pr');
          }
        } else {
          reporter.ok('release-wait-release-pr', 'No release PR created; successful release workflow detected.');
          summary.releasePr = 'skipped (workflow path)';
          summary.actionsPerformed.push('release workflow detected: no release PR required');
        }
      }
    } else {
      summary.releasePr = 'skipped';
      summary.actionsSkipped.push('wait release pr');
    }

    let verificationPassed = false;
    if (args.verifyNpm && !args.dryRun && releaseCandidate) {
      reporter.start('release-verify-post-merge', 'Validating post-merge release state...');
      const verification = adapter.verifyPostMerge({
        args,
        config,
        deps: {
          ...deps,
          log: logStep
        },
        gitContext,
        releaseContext: effectiveReleaseContext,
        releaseCandidate,
        primitives,
        constants: {
          DEFAULT_BASE_BRANCH,
          DEFAULT_BETA_BRANCH
        }
      });
      if (!verification || verification.pass !== true) {
        summary.npmValidation = `failed (${effectiveReleaseContext.expectedTag})`;
        throw new Error((verification && Array.isArray(verification.diagnostics) ? verification.diagnostics.join('\n') : 'Release verification failed.'));
      }
      const targets = Array.isArray(verification.targets) ? verification.targets : [];
      reporter.ok('release-verify-post-merge', `${targets.length} package(s) validated on tag ${effectiveReleaseContext.expectedTag}.`);
      summary.actionsPerformed.push(`npm validation: ${targets.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')} (${effectiveReleaseContext.expectedTag})`);
      summary.npmValidation = `pass (${effectiveReleaseContext.expectedTag} -> ${targets.map((pkg) => pkg.version).join(', ')})`;
      if (verification.workflowOutcome && verification.workflowOutcome.message) {
        reporter.ok('release-workflow-outcome', verification.workflowOutcome.message);
        summary.releasePr = verification.workflowOutcome.releasePrStatus || summary.releasePr;
        summary.actionsPerformed.push(verification.workflowOutcome.message);
      }
      verificationPassed = true;
    } else if (!args.verifyNpm) {
      summary.actionsSkipped.push('verify post-merge');
      summary.npmValidation = 'skipped';
    } else if (args.dryRun) {
      summary.npmValidation = 'skipped (dry-run)';
    } else if (!releaseCandidate) {
      summary.npmValidation = 'skipped (release candidate not merged/discovered)';
    }

    if (!args.dryRun && verificationPassed) {
      if (args.taskId) {
        markTaskReleased(args.taskId, config, process.cwd(), { dryRun: args.dryRun });
      }
      if (args.confirmCleanup && !args.yes) {
        await confirmOrThrow('Release completed and post-merge validation passed.\nProceed with local cleanup now?');
      }
      runLocalCleanup({
        deps,
        originalBranch,
        targetBaseBranch: effectiveReleaseContext.targetBaseBranch,
        shouldRun: args.cleanup,
        summary,
        reporter
      });
    } else if (!args.dryRun && !verificationPassed) {
      summary.actionsSkipped.push('cleanup (post-merge validation did not pass)');
      summary.cleanup = 'skipped (requires post-merge validation pass)';
    } else {
      summary.actionsSkipped.push('cleanup (dry-run)');
      summary.cleanup = 'skipped (dry-run)';
    }

    printOrchestrationSummary(`release completed in ${detectedMode} mode`, summary);
    return;
  }

  const publishCandidates = adapter.findReleaseCandidates({
    args,
    config,
    gitContext,
    releaseContext: effectiveReleaseContext,
    primitives,
    constants: {
      DEFAULT_BASE_BRANCH,
      DEFAULT_BETA_BRANCH
    }
  }) || [];
  const selectedPublishCandidate = adapter.selectReleaseCandidate({
    args,
    config,
    gitContext,
    releaseContext: effectiveReleaseContext,
    primitives,
    constants: {
      DEFAULT_BASE_BRANCH,
      DEFAULT_BETA_BRANCH
    }
  }, publishCandidates);

  if (!selectedPublishCandidate || selectedPublishCandidate.type !== 'release_pr') {
    throw new Error('No release PR found. Expected an open release PR candidate.');
  }

  const releasePr = selectedPublishCandidate.releasePr;
  const effectivePublishTrack = releasePr.baseRefName === DEFAULT_BASE_BRANCH ? 'stable' : 'beta';
  summary.releaseTrack = effectivePublishTrack;
  summary.prAction = `selected release pr (#${releasePr.number})`;
  summary.prUrl = releasePr.url;
  summary.branchPushed = 'skipped';
  summary.autoMerge = 'skipped';

  if (args.watchChecks) {
    if (args.dryRun) {
      summary.checks = `dry-run: would watch checks (${args.checkTimeout}m)`;
    } else {
      reporter.start('release-publish-checks', `Watching release PR checks #${releasePr.number}...`);
      watchPrChecks(gitContext.repo, releasePr.number, args.checkTimeout, deps);
      reporter.ok('release-publish-checks', `Release PR checks green (#${releasePr.number}).`);
      summary.checks = 'green';
      summary.actionsPerformed.push(`release checks watched: #${releasePr.number}`);
    }
  } else {
    summary.checks = 'skipped';
    summary.actionsSkipped.push('watch release checks');
  }

  if (args.mergeReleasePr || args.mergeWhenGreen) {
    if (args.dryRun) {
      summary.merge = `dry-run: would merge release PR #${releasePr.number}`;
      summary.releasePr = `dry-run: would merge (#${releasePr.number})`;
    } else {
      reporter.start('release-publish-merge-ready', `Checking merge readiness for release PR #${releasePr.number}...`);
      const publishReadiness = waitForPrMergeReadinessOrThrow(
        gitContext.repo,
        releasePr.number,
        `Release PR #${releasePr.number}`,
        args.checkTimeout,
        deps,
        { allowBehindTransient: true }
      );
      await confirmMergeIfNeeded(args, publishReadiness, `Release PR #${releasePr.number}`);
      reporter.ok('release-publish-merge-ready', `Release PR #${releasePr.number} is ready for merge.`);
      reporter.start('release-publish-auto-merge', `Enabling auto-merge for release PR #${releasePr.number}...`);
      enablePrAutoMerge(gitContext.repo, releasePr.number, args.mergeMethod, deps);
      reporter.ok('release-publish-auto-merge', `Auto-merge enabled for release PR #${releasePr.number}.`);
      reporter.start('release-publish-wait-merge', `Waiting for release PR #${releasePr.number} merge...`);
      waitForPrMerged(gitContext.repo, releasePr.number, args.releasePrTimeout, deps);
      reporter.ok('release-publish-wait-merge', `Release PR #${releasePr.number} merged.`);
      summary.merge = `merged release pr (#${releasePr.number})`;
      summary.releasePr = `merged (#${releasePr.number})`;
      summary.autoMerge = 'enabled (release)';
      summary.actionsPerformed.push(`release pr merged: #${releasePr.number}`);
      if (args.taskId) {
        const mergeCommit = getPrMergeCommitSha(gitContext.repo, releasePr.number, deps);
        markTaskMerged(args.taskId, mergeCommit, config, process.cwd(), { dryRun: args.dryRun });
      }
    }
  } else {
    summary.merge = 'skipped';
    summary.releasePr = `discovered (#${releasePr.number})`;
    summary.actionsSkipped.push('merge release pr');
  }

  let verificationPassed = false;
  if (args.verifyNpm && !args.dryRun && (args.mergeReleasePr || args.mergeWhenGreen)) {
    reporter.start('release-verify-post-merge', 'Validating post-merge release state...');
    const publishReleaseContext = {
      ...effectiveReleaseContext,
      track: effectivePublishTrack,
      expectedTag: effectivePublishTrack === 'stable' ? 'latest' : 'beta',
      targetBaseBranch: effectivePublishTrack === 'stable' ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH,
      expectedReleasePrBase: releasePr.baseRefName,
      workflowBranch: effectivePublishTrack === 'stable' ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH
    };
    const verification = adapter.verifyPostMerge({
      args,
      config,
      deps: {
        ...deps,
        log: logStep
      },
      gitContext,
      releaseContext: publishReleaseContext,
      releaseCandidate: {
        type: 'release_pr',
        releasePr
      },
      primitives,
      constants: {
        DEFAULT_BASE_BRANCH,
        DEFAULT_BETA_BRANCH
      }
    });
    if (!verification || verification.pass !== true) {
      summary.npmValidation = `failed (${publishReleaseContext.expectedTag})`;
      throw new Error((verification && Array.isArray(verification.diagnostics) ? verification.diagnostics.join('\n') : 'Release verification failed.'));
    }
    const targets = Array.isArray(verification.targets) ? verification.targets : [];
    reporter.ok('release-verify-post-merge', `${targets.length} package(s) validated on tag ${publishReleaseContext.expectedTag}.`);
    summary.actionsPerformed.push(`npm validation: ${targets.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')} (${publishReleaseContext.expectedTag})`);
    summary.npmValidation = `pass (${publishReleaseContext.expectedTag} -> ${targets.map((pkg) => pkg.version).join(', ')})`;
    verificationPassed = true;
  } else if (!args.verifyNpm) {
    summary.npmValidation = 'skipped';
  } else if (args.dryRun) {
    summary.npmValidation = 'skipped (dry-run)';
  } else {
    summary.npmValidation = 'skipped (release pr not merged)';
  }

  if (!args.dryRun && verificationPassed) {
    if (args.taskId) {
      markTaskReleased(args.taskId, config, process.cwd(), { dryRun: args.dryRun });
    }
    if (args.confirmCleanup && !args.yes) {
      await confirmOrThrow('Release completed and post-merge validation passed.\nProceed with local cleanup now?');
    }
      runLocalCleanup({
        deps,
        originalBranch,
        targetBaseBranch: effectivePublishTrack === 'stable' ? DEFAULT_BASE_BRANCH : DEFAULT_BETA_BRANCH,
        shouldRun: args.cleanup,
        summary,
        reporter
      });
  } else if (!args.dryRun && !verificationPassed) {
    summary.actionsSkipped.push('cleanup (post-merge validation did not pass)');
    summary.cleanup = 'skipped (requires post-merge validation pass)';
  } else {
    summary.cleanup = 'skipped (dry-run)';
  }

  printOrchestrationSummary(`release completed in ${detectedMode} mode`, summary);
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

function createBranchRulesetPayload(branchName, rulesetName = DEFAULT_RULESET_NAME) {
  return {
    name: rulesetName,
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [`refs/heads/${branchName}`],
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

function createBaseRulesetPayload(defaultBranch) {
  return createBranchRulesetPayload(defaultBranch, DEFAULT_RULESET_NAME);
}

function createBetaRulesetPayload(betaBranch) {
  return createBranchRulesetPayload(betaBranch, `Beta branch protection (${betaBranch})`);
}

function createFirebaseRulesetPayloads(baseBranch, productionBranch) {
  return {
    base: createBranchRulesetPayload(baseBranch, `Develop branch protection (${baseBranch})`),
    production: createBranchRulesetPayload(productionBranch, `Production branch protection (${productionBranch})`)
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

function listActionsSecretNames(deps, repo) {
  const listResult = ghApi(deps, 'GET', `/repos/${repo}/actions/secrets?per_page=100`);
  if (listResult.status !== 0) {
    throw new Error(`Failed to list Actions secrets: ${listResult.stderr || listResult.stdout}`.trim());
  }

  const parsed = parseJsonOutput(listResult.stdout || '{}', 'Failed to parse Actions secrets response from GitHub API.');
  const secrets = Array.isArray(parsed.secrets) ? parsed.secrets : [];
  return secrets
    .map((item) => item && item.name)
    .filter(Boolean);
}

function findMissingReleaseAuthAppSecrets(existingNames) {
  const nameSet = new Set(existingNames || []);
  const missing = [...RELEASE_AUTH_APP_REQUIRED_SECRETS].filter((name) => !nameSet.has(name));
  const hasClientOrAppId = RELEASE_AUTH_APP_ID_SECRETS.some((name) => nameSet.has(name));
  if (!hasClientOrAppId) {
    missing.push('GH_APP_CLIENT_ID or GH_APP_ID');
  }

  return missing;
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
    SCOPE: options.scope,
    ...buildReleaseAuthVariables(options.releaseAuth || DEFAULT_RELEASE_AUTH)
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
    betaRulesetPayload: createBetaRulesetPayload(args.betaBranch),
    missingReleaseAuthAppSecrets: []
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

    if (args.releaseAuth === 'app') {
      reporter.start('validate-release-auth-app', 'Checking repository secrets for release-auth app mode...');
      const secretNames = listActionsSecretNames(deps, result.repo);
      result.missingReleaseAuthAppSecrets = findMissingReleaseAuthAppSecrets(secretNames);
      if (result.missingReleaseAuthAppSecrets.length > 0) {
        reporter.warn('validate-release-auth-app', `Missing app secrets: ${result.missingReleaseAuthAppSecrets.join(', ')}`);
      } else {
        reporter.ok('validate-release-auth-app', 'Required app secrets detected.');
      }
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
  const details = [summarizePlannedInitActions(selections, args, context)];

  if (args.force) {
    details.push('- --force will overwrite managed files/scripts/dependencies when applicable.');
  }

  if (selections.withGithub && context.existingMainRuleset) {
    details.push(`- Ruleset "${context.mainRulesetPayload.name}" already exists and will be overwritten.`);
  }

  if (selections.withBeta && context.betaBranchExists) {
    details.push(`- Branch "${args.betaBranch}" already exists and will be used as beta release flow branch.`);
  }

  if (selections.withBeta && context.existingBetaRuleset) {
    details.push(`- Ruleset "${context.betaRulesetPayload.name}" already exists and will be overwritten.`);
  }

  if (args.releaseAuth === 'app' && context.missingReleaseAuthAppSecrets.length > 0) {
    details.push(`- release-auth app mode is missing secrets: ${context.missingReleaseAuthAppSecrets.join(', ')}`);
  }

  await confirmOrThrow(details.join('\n'));
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
    summary.warnings.push(`package "${packageJson.name}" was not found on npm. Run "ship setup-npm --dir ${targetDir} --publish-first" to perform first publish.`);
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
  await resolveReleaseAuthSelection(args, summary, { contextLabel: 'Select release auth mode for beta flow' });
  summary.updatedScriptKeys.push('github.beta_branch', 'github.beta_ruleset', 'actions.default_workflow_permissions');
  summary.updatedScriptKeys.push(`release.auth:${args.releaseAuth}`);
  const releaseAuthVariables = buildReleaseAuthVariables(args.releaseAuth || DEFAULT_RELEASE_AUTH);
  const desiredScripts = {
    'beta:enter': 'changeset pre enter beta',
    'beta:exit': 'changeset pre exit',
    'beta:version': 'changeset version',
    'beta:publish': 'changeset publish',
    'beta:promote': 'ship promote-stable --dir .'
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

  let missingAppSecrets = [];
  let appSecretsChecked = false;
  if (args.releaseAuth === 'app') {
    try {
      const secretNames = listActionsSecretNames(deps, repo);
      missingAppSecrets = findMissingReleaseAuthAppSecrets(secretNames);
      appSecretsChecked = true;
    } catch (error) {
      summary.warnings.push(`Could not validate release-auth app secrets: ${error.message}`);
    }
  }
  appendReleaseAuthWarnings(summary, args.releaseAuth, { missingAppSecrets, appSecretsChecked });

  if (args.dryRun) {
    logStep('warn', 'Dry-run mode enabled. No remote or file changes will be applied.');
    const workflowPreview = upsertReleaseWorkflow(workflowTargetPath, workflowTemplatePath, {
      force: args.force,
      dryRun: true,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || ''),
        ...releaseAuthVariables
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
        SCOPE: deriveScope('', packageJson.name || ''),
        ...releaseAuthVariables
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
      const confirmDetails = [
        `This will modify GitHub repository settings for ${repo}:`,
        '- set Actions workflow permissions to write',
        `- ensure branch "${args.betaBranch}" exists${doesBranchExist ? ' (already exists)' : ' (will be created)'}`,
        `- apply branch protection ruleset "${betaRulesetPayload.name}"`,
        `- require CI status check "${REQUIRED_CHECK_CONTEXT}" on beta branch`,
        `- update local ${workflowRelativePath} and package.json beta scripts`
      ];

      if (existingRuleset) {
        confirmDetails.push(`- existing ruleset "${betaRulesetPayload.name}" will be overwritten`);
      }

      if (missingAppSecrets.length > 0) {
        confirmDetails.push(`- release-auth app mode is missing secrets: ${missingAppSecrets.join(', ')}`);
      }

      await confirmOrThrow(confirmDetails.join('\n'));
    }

    logStep('run', `Ensuring ${workflowRelativePath} includes stable+beta triggers...`);
    const workflowUpsert = upsertReleaseWorkflow(workflowTargetPath, workflowTemplatePath, {
      force: args.force,
      dryRun: false,
      variables: {
        PACKAGE_NAME: packageJson.name || packageDirFromName(path.basename(targetDir)),
        DEFAULT_BRANCH: args.defaultBranch,
        BETA_BRANCH: args.betaBranch,
        SCOPE: deriveScope('', packageJson.name || ''),
        ...releaseAuthVariables
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
        SCOPE: deriveScope('', packageJson.name || ''),
        ...releaseAuthVariables
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
    allow_merge_commit: true,
    allow_rebase_merge: true
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

function upsertSimpleWorkflow(targetPath, templatePath, options = {}) {
  const exists = fs.existsSync(targetPath);
  const action = exists ? (options.force ? 'overwritten' : 'skipped') : 'created';

  if (action === 'skipped') {
    return { result: 'skipped' };
  }

  if (options.dryRun) {
    return { result: action };
  }

  ensureFileFromTemplate(targetPath, templatePath, {
    force: options.force,
    dryRun: false,
    variables: options.variables || {}
  });
  return { result: action };
}

function applyLocalFirebaseSetup(args, summary, reporter) {
  const targetDir = path.resolve(args.dir);
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(targetDir) || !fs.existsSync(packageJsonPath)) {
    summary.warnings.push(`Skipping local firebase workflow setup: package.json not found in ${targetDir}.`);
    return;
  }

  const packageRoot = path.resolve(__dirname, '..');
  const templateDir = path.join(packageRoot, 'template');
  const workflowSpecs = [
    ['.github/workflows/deploy-staging.yml', '.github/workflows/deploy-staging.yml'],
    ['.github/workflows/deploy-production.yml', '.github/workflows/deploy-production.yml']
  ];
  const variables = {
    BASE_BRANCH: args.baseBranch,
    PRODUCTION_BRANCH: args.productionBranch
  };

  for (const [targetRelative, templateRelative] of workflowSpecs) {
    const targetPath = path.join(targetDir, targetRelative);
    const templatePath = path.join(templateDir, templateRelative);
    if (!fs.existsSync(templatePath)) {
      summary.warnings.push(`Skipping ${targetRelative}: missing template ${templateRelative}.`);
      continue;
    }

    reporter.start('firebase-workflow', `Ensuring ${targetRelative}...`);
    const result = upsertSimpleWorkflow(targetPath, templatePath, {
      force: args.force,
      dryRun: args.dryRun,
      variables
    });
    if (result.result === 'created') {
      summary.createdFiles.push(targetRelative);
      reporter.ok('firebase-workflow', `${targetRelative} created.`);
    } else if (result.result === 'overwritten') {
      summary.overwrittenFiles.push(targetRelative);
      reporter.ok('firebase-workflow', `${targetRelative} overwritten.`);
    } else {
      summary.skippedFiles.push(targetRelative);
      reporter.warn('firebase-workflow', `${targetRelative} already exists; kept as-is.`);
    }
  }
}

function applyGithubFirebaseSetup(args, dependencies, summary, reporter) {
  const deps = {
    exec: dependencies.exec || execCommand
  };
  const repo = resolveRepo(args, deps);
  const rulesets = createFirebaseRulesetPayloads(args.baseBranch, args.productionBranch);

  summary.updatedScriptKeys.push(
    'repository.default_branch',
    'repository.delete_branch_on_merge',
    'repository.allow_auto_merge',
    'repository.merge_policy',
    'actions.default_workflow_permissions',
    'github.firebase.base_branch',
    'github.firebase.production_branch'
  );

  if (args.dryRun) {
    summary.warnings.push(`dry-run: would ensure branch "${args.baseBranch}" exists in ${repo}`);
    summary.warnings.push(`dry-run: would set default branch to ${args.baseBranch}`);
    summary.warnings.push(`dry-run: would upsert ruleset "${rulesets.base.name}"`);
    summary.warnings.push(`dry-run: would upsert ruleset "${rulesets.production.name}"`);
    summary.warnings.push(`dry-run: would set actions workflow permissions to write for ${repo}`);
    return { repo };
  }

  reporter.start('github-firebase-branch', `Ensuring branch "${args.baseBranch}" exists...`);
  const branchResult = ensureBranchExists(deps, repo, args.productionBranch, args.baseBranch);
  if (branchResult === 'created') {
    summary.createdFiles.push(`github-branch:${args.baseBranch}`);
    reporter.ok('github-firebase-branch', `Branch "${args.baseBranch}" created.`);
  } else {
    summary.skippedFiles.push(`github-branch:${args.baseBranch}`);
    reporter.warn('github-firebase-branch', `Branch "${args.baseBranch}" already exists.`);
  }

  reporter.start('github-firebase-settings', 'Applying GitHub repository settings...');
  const repoPayload = {
    default_branch: args.baseBranch,
    delete_branch_on_merge: true,
    allow_auto_merge: true,
    allow_squash_merge: true,
    allow_merge_commit: true,
    allow_rebase_merge: true
  };
  const patchRepo = ghApi(deps, 'PATCH', `/repos/${repo}`, repoPayload);
  if (patchRepo.status !== 0) {
    reporter.fail('github-firebase-settings', 'Failed to update repository settings.');
    throw new Error(`Failed to update repository settings: ${patchRepo.stderr || patchRepo.stdout}`.trim());
  }
  reporter.ok('github-firebase-settings', 'Repository settings updated.');

  reporter.start('github-firebase-workflow-permissions', 'Applying GitHub Actions workflow permissions...');
  updateWorkflowPermissions(deps, repo);
  reporter.ok('github-firebase-workflow-permissions', 'Workflow permissions configured.');

  reporter.start('github-firebase-ruleset-develop', `Applying ruleset "${rulesets.base.name}"...`);
  const baseUpsert = upsertRuleset(deps, repo, rulesets.base);
  summary.overwrittenFiles.push(`github-firebase-ruleset:${baseUpsert}:develop`);
  reporter.ok('github-firebase-ruleset-develop', `Develop ruleset ${baseUpsert}.`);

  reporter.start('github-firebase-ruleset-production', `Applying ruleset "${rulesets.production.name}"...`);
  const productionUpsert = upsertRuleset(deps, repo, rulesets.production);
  summary.overwrittenFiles.push(`github-firebase-ruleset:${productionUpsert}:production`);
  reporter.ok('github-firebase-ruleset-production', `Production ruleset ${productionUpsert}.`);
  return { repo };
}

function applyLocalBetaSetup(args, summary, reporter) {
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
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template not found in ${templateDir}`);
  }

  const packageJson = readJsonFile(packageJsonPath);
  packageJson.scripts = packageJson.scripts || {};
  const desiredScripts = {
    'beta:enter': 'changeset pre enter beta',
    'beta:exit': 'changeset pre exit',
    'beta:version': 'changeset version',
    'beta:publish': 'changeset publish',
    'beta:promote': 'ship promote-stable --dir .'
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

  ensureBetaWorkflowTriggers(
    targetDir,
    templateDir,
    {
      force: args.force,
      dryRun: args.dryRun,
      defaultBranch: args.defaultBranch,
      betaBranch: args.betaBranch,
      packageName: packageJson.name || packageDirFromName(path.basename(targetDir)),
      scope: deriveScope('', packageJson.name || ''),
      releaseAuth: args.releaseAuth
    },
    summary,
    reporter
  );

  if (args.dryRun) {
    if (packageJsonChanged) {
      summary.warnings.push('dry-run: would update package.json beta scripts');
    }
    return;
  }

  if (packageJsonChanged) {
    reporter.start('local-beta-scripts', 'Updating package.json beta scripts...');
    writeJsonFile(packageJsonPath, packageJson);
    reporter.ok('local-beta-scripts', 'package.json beta scripts updated.');
  } else {
    reporter.warn('local-beta-scripts', 'package.json beta scripts already present; no changes needed.');
  }
}

function setupGithub(args, dependencies = {}) {
  const summary = createSummary();
  const deps = {
    exec: dependencies.exec || execCommand
  };
  ensureGhAvailable(deps);

  const reporter = new StepReporter();
  if (args.adapter === 'firebase') {
    const { repo } = applyGithubFirebaseSetup(args, dependencies, summary, reporter);
    applyLocalFirebaseSetup(args, summary, reporter);
    summary.warnings.push('Firebase profile configured. Next step: connect deploy workflows and required secrets/environments.');
    printSummary(args.dryRun ? `GitHub+firebase setup dry-run for ${repo}` : `GitHub+firebase setup applied to ${repo}`, summary);
    return;
  }

  const { repo } = applyGithubMainSetup(args, dependencies, summary, reporter);
  applyGithubBetaSetup(args, dependencies, summary, reporter, repo);
  applyLocalBetaSetup(args, summary, reporter);
  appendReleaseAuthWarnings(summary, args.releaseAuth);
  summary.warnings.push(`Trusted Publisher supports a single workflow file per package. Keep publishing on .github/workflows/release.yml for both stable and beta.`);
  summary.warnings.push(`Next step: run "npm run beta:enter" once on "${args.betaBranch}", commit .changeset/pre.json, and push.`);
  printSummary(args.dryRun ? `GitHub+beta setup dry-run for ${repo}` : `GitHub+beta setup applied to ${repo}`, summary);
}

async function run(argv, dependencies = {}) {
  const parsed = parseArgs(argv);

  if (parsed.mode === 'version') {
    const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
    const packageJson = readJsonFile(packageJsonPath);
    console.log(packageJson.version);
    return;
  }

  if (parsed.args.help) {
    console.log(usage());
    return;
  }

  if (parsed.mode === 'completion') {
    console.log(renderCompletion(parsed.args.shell));
    return;
  }

  const config = loadShipConfig(process.cwd());
  validateShipConfig(config);
  const resolveConfiguredAdapter = (name) => resolveAdapter(String(name || config.adapter || 'npm'), {
    cwd: process.cwd(),
    adapterModule: config.adapterModule,
    resolveAdapter: dependencies.resolveAdapter
  });

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

  if (parsed.mode === 'config') {
    const result = updateConfigDefaultsForScope(parsed.args, process.cwd());
    printConfigDefaultsResult(result, parsed.args.json);
    return;
  }

  if (parsed.mode === 'task') {
    runTaskCommand(parsed.args, config, dependencies);
    return;
  }

  if (parsed.mode === 'release') {
    await runReleaseByTargets(applyReleaseArgDefaults(parsed.args, config), config, dependencies, {
      resolveAdapterByName: (name) => resolveConfiguredAdapter(name),
      runReleaseForTarget: (releaseArgs, adapter) => runReleaseCycleCore(releaseArgs, adapter, dependencies, config)
    });
    return;
  }

  if (parsed.mode === 'create') {
    createNewPackage(parsed.args);
  }
}

module.exports = {
  run,
  loadShipConfig,
  validateShipConfig,
  resolveReleaseAdapterName,
  resolveReleaseTargetPlan,
  runReleaseByTargets,
  resolveAdapter,
  runCodePrCore,
  runReleaseCycleCore,
  runCodePrFlow,
  runReleaseCycle,
  renderPrBodyDeterministic,
  validateAdapterForCapability,
  runTaskCommand
};
