/**
 * @typedef {{
 *   repo?: string,
 *   cwd?: string,
 *   args?: Record<string, any>
 * }} AdapterContext
 */

/** @type {{
 *  name: 'npm',
 *  detectMode: (context: AdapterContext) => 'open-pr' | 'publish' | 'autoOverride',
 *  preMerge: (context: AdapterContext) => { warnings: string[], actions: string[] },
 *  postMerge: (context: AdapterContext) => { releaseRef: string, releaseMeta: Record<string, any> },
 *  verifyRelease: (context: AdapterContext, releaseMeta: Record<string, any>) => { pass: boolean, diagnostics: string[] },
 *  summarize: (context: AdapterContext, result: Record<string, any>) => { extras: string[] }
 * }} */
const npmAdapter = {
  name: 'npm',
  capabilities: {
    create: true,
    init: true,
    setupGithub: true,
    setupBeta: true,
    setupNpm: true,
    openPr: true,
    releaseCycle: true,
    promoteStable: true
  },
  detectMode(context) {
    const requestedMode = context && context.args && typeof context.args.mode === 'string'
      ? context.args.mode
      : 'auto';
    return requestedMode === 'auto' ? 'autoOverride' : requestedMode;
  },
  preMerge() {
    return { warnings: [], actions: [] };
  },
  postMerge() {
    return { releaseRef: 'release/beta', releaseMeta: {} };
  },
  verifyRelease() {
    return { pass: true, diagnostics: [] };
  },
  summarize() {
    return { extras: [] };
  }
};

module.exports = {
  npmAdapter
};
