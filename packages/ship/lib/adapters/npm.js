/**
 * npm domain adapter for ship release orchestration.
 * The core passes runtime primitives via context.primitives so this module stays focused on domain rules.
 */

function resolveTrack(args) {
  if (args.track && args.track !== 'auto') {
    return args.track;
  }
  return args.promoteStable ? 'stable' : 'beta';
}

function resolveExpectedTag(track) {
  return track === 'stable' ? 'latest' : 'beta';
}

function resolveWorkflowBranch(track, constants) {
  return track === 'stable' ? constants.DEFAULT_BASE_BRANCH : constants.DEFAULT_BETA_BRANCH;
}

const npmAdapter = {
  name: 'npm',
  capabilities: {
    create: true,
    init: true,
    setupGithub: true,
    setupBeta: true,
    setupNpm: true,
    release: true,
    promoteStable: true
  },

  normalizeArgs(args) {
    return { ...args };
  },

  preparePrContext(context) {
    const { args, config = {} } = context;
    const next = {};
    if (!args.base) {
      next.base = config.betaBranch || context.constants.DEFAULT_BETA_BRANCH;
    }
    return next;
  },

  detectReleaseMode(context) {
    const { args, gitContext, releaseContext, primitives } = context;
    if (args.promoteStable) {
      return 'code';
    }

    if (args.mode && args.mode !== 'auto') {
      return args.mode;
    }

    if (gitContext.head.startsWith('changeset-release/')) {
      return 'publish';
    }

    if (gitContext.head !== context.constants.DEFAULT_BETA_BRANCH) {
      return 'code';
    }

    const releasePrs = primitives.findReleaseCandidates({
      repo: gitContext.repo,
      expectedBase: releaseContext.expectedReleasePrBase
    });

    if (releasePrs.length === 1) {
      return 'publish';
    }
    if (releasePrs.length > 1) {
      throw new Error(`Multiple candidate release PRs detected: ${releasePrs.map((item) => item.url).join(', ')}`);
    }

    return 'code';
  },

  resolveReleaseContext(context) {
    const { args, constants } = context;
    const track = resolveTrack(args);
    const expectedTag = resolveExpectedTag(track);
    const targetBaseBranch = track === 'stable' ? constants.DEFAULT_BASE_BRANCH : constants.DEFAULT_BETA_BRANCH;
    return {
      track,
      expectedTag,
      targetBaseBranch,
      expectedReleasePrBase: targetBaseBranch,
      workflowBranch: resolveWorkflowBranch(track, constants),
      allowDirectPublish: track === 'beta'
    };
  },

  findReleaseCandidates(context) {
    const {
      gitContext,
      releaseContext,
      args,
      primitives,
      waitStartedAtMs = 0
    } = context;

    const releasePrs = primitives.findReleaseCandidates({
      repo: gitContext.repo,
      expectedBase: releaseContext.expectedReleasePrBase
    });

    const candidates = releasePrs.map((releasePr) => ({
      type: 'release_pr',
      releasePr
    }));

    if (!releaseContext.allowDirectPublish || candidates.length > 0) {
      return candidates;
    }

    if (args.waitReleasePr === false) {
      return candidates;
    }

    const run = primitives.getLatestWorkflowRunForBranch(gitContext.repo, releaseContext.workflowBranch);
    if (!run) {
      return candidates;
    }

    const updatedAtMs = run.updatedAt ? Date.parse(run.updatedAt) : 0;
    const recentlyUpdated = Number.isFinite(updatedAtMs) && updatedAtMs >= waitStartedAtMs;
    const completed = String(run.status || '').toLowerCase() === 'completed';
    const success = ['success', 'neutral', 'skipped'].includes(String(run.conclusion || '').toLowerCase());
    const looksLikeReleaseFlow = String(run.workflowName || '').toLowerCase().includes('release')
      || String(run.event || '').toLowerCase() === 'push';

    if (recentlyUpdated && completed && success && looksLikeReleaseFlow) {
      candidates.push({
        type: 'direct_publish',
        workflowRun: run
      });
    }

    return candidates;
  },

  selectReleaseCandidate(context, candidates) {
    const { args } = context;
    const releaseCandidates = candidates.filter((item) => item.type === 'release_pr');
    const filtered = args.head
      ? releaseCandidates.filter((item) => item.releasePr.headRefName === args.head)
      : releaseCandidates;

    if (filtered.length === 1) {
      return filtered[0];
    }

    if (filtered.length > 1) {
      throw new Error(`Ambiguous release PR selection: ${filtered.map((item) => item.releasePr.url).join(', ')}`);
    }

    const directPublish = candidates.find((item) => item.type === 'direct_publish');
    if (directPublish) {
      return directPublish;
    }

    return null;
  },

  resolveValidationTargets(context) {
    const { gitContext, releaseContext, releaseCandidate, args, primitives } = context;
    const releasePrNumber = releaseCandidate && releaseCandidate.type === 'release_pr'
      ? releaseCandidate.releasePr.number
      : 0;

    return primitives.resolveExpectedNpmPackages(
      gitContext.repo,
      releasePrNumber,
      releaseContext.targetBaseBranch,
      releaseContext.expectedTag,
      args
    );
  },

  verifyPostMerge(context) {
    const {
      gitContext,
      releaseContext,
      args,
      releaseCandidate,
      primitives,
      deps
    } = context;

    const targets = this.resolveValidationTargets(context);
    primitives.assertReleaseWorkflowHealthyOrThrow(gitContext.repo, releaseContext.workflowBranch);

    const validation = primitives.validateNpmPublishedPackages(
      targets,
      releaseContext.expectedTag,
      args.releasePrTimeout,
      {
        onProgress: ({ expectedTag, observations }) => {
          primitives.assertReleaseWorkflowHealthyOrThrow(gitContext.repo, releaseContext.workflowBranch);
          const statusLine = Object.values(observations)
            .map((entry) => `${entry.name}: expected ${expectedTag}=${entry.expectedVersion}, observed version=${entry.observedVersion || 'n/a'}, ${expectedTag}=${entry.observedTagVersion || 'n/a'}`)
            .join(' | ');
          deps.log('run', `Waiting npm propagation... ${statusLine}`);
        }
      }
    );

    if (validation.status !== 'pass') {
      const observedLines = Object.values(validation.observations || {})
        .map((entry) => `${entry.name}: version=${entry.observedVersion || 'n/a'}, ${releaseContext.expectedTag}=${entry.observedTagVersion || 'n/a'}`);
      const expectedLines = targets
        .map((pkg) => `${pkg.name}@${pkg.version}`);
      return {
        pass: false,
        expectedTag: releaseContext.expectedTag,
        targets,
        diagnostics: [
          'npm validation failed after release merge.',
          `Expected (${releaseContext.expectedTag}): ${expectedLines.join(', ')}`,
          ...observedLines
        ]
      };
    }

    return {
      pass: true,
      expectedTag: releaseContext.expectedTag,
      targets,
      releaseCandidate,
      observations: validation.observations
    };
  },

  summarize(_context, result) {
    const extras = [];
    if (result && result.expectedTag && Array.isArray(result.targets) && result.targets.length > 0) {
      extras.push(`npm validation: ${result.targets.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')} (${result.expectedTag})`);
    }
    return { extras };
  }
};

module.exports = {
  npmAdapter
};
