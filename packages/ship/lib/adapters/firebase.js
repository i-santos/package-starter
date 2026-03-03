function resolveDefaultBaseBranch(config = {}) {
  return config.baseBranch || 'develop';
}

function resolveReleaseBranch(config = {}) {
  return config.betaBranch || 'release/beta';
}

const firebaseAdapter = {
  name: 'firebase',
  capabilities: {
    openPr: true,
    release: true
  },

  normalizeArgs(args) {
    return { ...args };
  },

  preparePrContext(context) {
    const { args, config = {} } = context;
    if (args.base) {
      return {};
    }
    return {
      base: resolveDefaultBaseBranch(config)
    };
  },

  detectReleaseMode(context) {
    const { args, gitContext, releaseContext } = context;
    if (args.mode && args.mode !== 'auto') {
      return args.mode;
    }

    if (gitContext.head.startsWith('release/')) {
      return 'publish';
    }

    if (gitContext.head === releaseContext.releaseBranch) {
      return 'publish';
    }

    return 'open-pr';
  },

  resolveReleaseContext(context) {
    const { args, config = {}, constants } = context;
    const baseBranch = resolveDefaultBaseBranch(config);
    const productionBranch = config.productionBranch || constants.DEFAULT_BASE_BRANCH;
    const releaseBranch = resolveReleaseBranch(config);
    const track = args.track === 'stable' ? 'stable' : 'beta';
    const targetBaseBranch = track === 'stable' ? productionBranch : baseBranch;

    return {
      track,
      expectedTag: 'deploy',
      targetBaseBranch,
      expectedReleasePrBase: targetBaseBranch,
      workflowBranch: targetBaseBranch,
      allowDirectPublish: false,
      releaseBranch
    };
  },

  findReleaseCandidates(context) {
    const { gitContext, releaseContext, args, primitives } = context;
    const prs = primitives.listOpenPullRequests(gitContext.repo);
    const releasePrs = prs.filter((pr) => pr
      && typeof pr.headRefName === 'string'
      && pr.headRefName.startsWith('release/')
      && (!releaseContext.expectedReleasePrBase || pr.baseRefName === releaseContext.expectedReleasePrBase));

    const candidates = releasePrs.map((releasePr) => ({
      type: 'release_pr',
      releasePr
    }));

    if (args.head) {
      return candidates.filter((candidate) => candidate.releasePr.headRefName === args.head);
    }

    return candidates;
  },

  selectReleaseCandidate(_context, candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error(`Ambiguous release PR selection: ${candidates.map((item) => item.releasePr.url).join(', ')}`);
    }

    return candidates[0];
  },

  verifyPostMerge(context) {
    const { gitContext, releaseContext, primitives } = context;
    primitives.assertReleaseWorkflowHealthyOrThrow(gitContext.repo, releaseContext.workflowBranch);
    return {
      pass: true,
      expectedTag: 'deploy',
      targets: []
    };
  },

  summarize() {
    return { extras: [] };
  }
};

module.exports = {
  firebaseAdapter
};
