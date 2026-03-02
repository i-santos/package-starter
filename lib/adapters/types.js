/**
 * @typedef {'open-pr'|'publish'} ReleaseMode
 *
 * @typedef {{
 *   type: 'release_pr',
 *   releasePr: { number: number, url?: string, headRefName?: string, baseRefName?: string }
 * } | {
 *   type: 'direct_publish',
 *   workflowRun: { databaseId?: number, workflowName?: string, status?: string, conclusion?: string, url?: string }
 * }} ReleaseCandidate
 *
 * @typedef {{
 *   name: string,
 *   capabilities?: {
 *     openPr?: boolean,
 *     release?: boolean
 *   },
 *   normalizeArgs?: (args: Record<string, any>, context: { command: string }) => Record<string, any>,
 *   preparePrContext?: (context: Record<string, any>) => Record<string, any> | void,
 *   detectReleaseMode?: (context: Record<string, any>) => ReleaseMode,
 *   resolveReleaseContext?: (context: Record<string, any>) => Record<string, any>,
 *   findReleaseCandidates?: (context: Record<string, any>) => ReleaseCandidate[],
 *   selectReleaseCandidate?: (context: Record<string, any>, candidates: ReleaseCandidate[]) => ReleaseCandidate | null,
 *   resolveValidationTargets?: (context: Record<string, any>) => Array<Record<string, any>>,
 *   verifyPostMerge?: (context: Record<string, any>) => Record<string, any>,
 *   summarize?: (context: Record<string, any>, coreSummary: Record<string, any>) => { extras?: string[] }
 * }} ShipAdapter
 */

function validateAdapterShape(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Adapter must be an object.');
  }
  if (!adapter.name || typeof adapter.name !== 'string') {
    throw new Error('Adapter must define a string "name".');
  }
}

function adapterHasCapability(adapter, capability) {
  if (!adapter || !adapter.capabilities) {
    return false;
  }
  return Boolean(adapter.capabilities[capability]);
}

function validateAdapterForCapability(adapter, capability) {
  validateAdapterShape(adapter);
  if (!adapterHasCapability(adapter, capability)) {
    throw new Error(`Adapter "${adapter.name}" does not implement ${capability} capability.`);
  }
}

module.exports = {
  validateAdapterShape,
  validateAdapterForCapability,
  adapterHasCapability
};
