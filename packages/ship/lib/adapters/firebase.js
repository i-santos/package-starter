function resolveDefaultBaseBranch(config = {}) {
  return config.baseBranch || 'develop';
}

function resolveReleaseBranch(config = {}) {
  return config.betaBranch || 'release/beta';
}

function resolveVerificationEnvironment(config = {}, releaseContext = {}) {
  if (releaseContext.track === 'stable') {
    return 'production';
  }
  return config.environment || 'staging';
}

function resolveHealthcheckUrl(config = {}, releaseContext = {}) {
  const firebase = config.firebase || {};
  if (typeof firebase.healthcheckUrl === 'string' && firebase.healthcheckUrl.trim()) {
    return firebase.healthcheckUrl.trim();
  }

  const urls = firebase.healthcheckUrls || {};
  const environment = resolveVerificationEnvironment(config, releaseContext);
  if (typeof urls[environment] === 'string' && urls[environment].trim()) {
    return urls[environment].trim();
  }
  if (releaseContext.track === 'stable' && typeof urls.production === 'string' && urls.production.trim()) {
    return urls.production.trim();
  }
  if (typeof urls.staging === 'string' && urls.staging.trim()) {
    return urls.staging.trim();
  }
  return '';
}

function verifyHealthcheck(url, deps) {
  if (!url || !deps || typeof deps.exec !== 'function') {
    return { pass: true };
  }

  const response = deps.exec('curl', [
    '-L',
    '--silent',
    '--show-error',
    '--max-time',
    '15',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    url
  ]);

  if (response.status !== 0) {
    return {
      pass: false,
      diagnostics: [`Healthcheck request failed for "${url}": ${(response.stderr || response.stdout || '').trim() || 'unknown error'}`]
    };
  }

  const httpCode = String(response.stdout || '').trim();
  if (!/^2\d\d$/.test(httpCode)) {
    return {
      pass: false,
      diagnostics: [`Healthcheck failed for "${url}": expected 2xx, got HTTP ${httpCode || 'unknown'}.`]
    };
  }

  return { pass: true };
}

function parseJsonSafely(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function getLatestWorkflowRun(repo, workflow, branch, deps) {
  if (!repo || !workflow || !branch || !deps || typeof deps.exec !== 'function') {
    return null;
  }

  const endpoint = `repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
  const response = deps.exec('gh', ['api', '-X', 'GET', endpoint]);
  if (response.status !== 0) {
    return null;
  }

  const parsed = parseJsonSafely(response.stdout || '{}', {});
  const run = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs[0] : null;
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    name: run.name || '',
    status: run.status || '',
    conclusion: run.conclusion || '',
    htmlUrl: run.html_url || ''
  };
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
    const { gitContext, releaseContext, args, primitives, config = {}, deps = {} } = context;
    const prs = primitives.listOpenPullRequests(gitContext.repo);
    const releasePrs = prs.filter((pr) => pr
      && typeof pr.headRefName === 'string'
      && pr.headRefName.startsWith('release/')
      && (!releaseContext.expectedReleasePrBase || pr.baseRefName === releaseContext.expectedReleasePrBase));

    const candidates = releasePrs.map((releasePr) => ({
      type: 'release_pr',
      releasePr
    }));

    const workflow = config.deploy && config.deploy.workflow ? String(config.deploy.workflow) : '';
    if (workflow) {
      const run = getLatestWorkflowRun(gitContext.repo, workflow, releaseContext.workflowBranch, deps);
      if (run && run.status === 'completed' && run.conclusion === 'success') {
        candidates.push({
          type: 'direct_publish',
          workflowRun: run
        });
      }
    }

    if (args.head) {
      return candidates.filter((candidate) => candidate && candidate.type === 'release_pr'
        && candidate.releasePr && candidate.releasePr.headRefName === args.head);
    }

    return candidates;
  },

  selectReleaseCandidate(_context, candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const releasePrCandidates = candidates.filter((candidate) => candidate && candidate.type === 'release_pr');
    if (releasePrCandidates.length > 1) {
      throw new Error(`Ambiguous release PR selection: ${releasePrCandidates.map((item) => item.releasePr.url).join(', ')}`);
    }
    if (releasePrCandidates.length === 1) {
      return releasePrCandidates[0];
    }

    const directPublishCandidate = candidates.find((candidate) => candidate && candidate.type === 'direct_publish');
    if (directPublishCandidate) {
      return directPublishCandidate;
    }

    return candidates[0] || null;
  },

  verifyPostMerge(context) {
    const { gitContext, releaseContext, primitives, config = {}, deps = {}, releaseCandidate } = context;
    const workflow = config.deploy && config.deploy.workflow ? String(config.deploy.workflow) : '';
    const healthcheckUrl = resolveHealthcheckUrl(config, releaseContext);

    if (releaseCandidate && releaseCandidate.type === 'direct_publish' && releaseCandidate.workflowRun) {
      const run = releaseCandidate.workflowRun;
      const pass = run.status === 'completed' && run.conclusion === 'success';
      const healthcheck = pass ? verifyHealthcheck(healthcheckUrl, deps) : { pass: false, diagnostics: [] };
      const finalPass = pass && healthcheck.pass;
      return {
        pass: finalPass,
        expectedTag: 'deploy',
        diagnostics: finalPass
          ? []
          : [
            ...(pass ? [] : [`Deploy workflow did not succeed: status=${run.status}, conclusion=${run.conclusion}`]),
            ...(!healthcheck.pass && Array.isArray(healthcheck.diagnostics) ? healthcheck.diagnostics : [])
          ],
        targets: []
      };
    }

    if (workflow) {
      const run = getLatestWorkflowRun(gitContext.repo, workflow, releaseContext.workflowBranch, deps);
      const workflowPass = !!(run && run.status === 'completed' && run.conclusion === 'success');
      const healthcheck = workflowPass ? verifyHealthcheck(healthcheckUrl, deps) : { pass: false, diagnostics: [] };
      const pass = workflowPass && healthcheck.pass;
      return {
        pass,
        expectedTag: 'deploy',
        diagnostics: pass
          ? []
          : [
            ...(workflowPass ? [] : [`Deploy workflow "${workflow}" is not successful yet on branch "${releaseContext.workflowBranch}".`]),
            ...(!healthcheck.pass && Array.isArray(healthcheck.diagnostics) ? healthcheck.diagnostics : [])
          ],
        targets: []
      };
    }

    primitives.assertReleaseWorkflowHealthyOrThrow(gitContext.repo, releaseContext.workflowBranch);
    const healthcheck = verifyHealthcheck(healthcheckUrl, deps);
    return {
      pass: healthcheck.pass,
      expectedTag: 'deploy',
      diagnostics: healthcheck.pass ? [] : (healthcheck.diagnostics || []),
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
