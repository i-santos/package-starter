const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canTransition,
  transitionTask,
  TASK_STATES
} = require('../lib');

test('agent exposes canonical task states', () => {
  assert.deepEqual(TASK_STATES, [
    'new',
    'planned',
    'tdd_ready',
    'implemented',
    'verified',
    'publish_ready',
    'released'
  ]);
});

test('agent allows forward lifecycle transitions', () => {
  assert.equal(canTransition('new', 'planned'), true);
  assert.equal(canTransition('planned', 'tdd_ready'), true);
  assert.equal(canTransition('publish_ready', 'released'), true);
});

test('agent allows controlled rollback transitions', () => {
  assert.equal(canTransition('verified', 'implemented'), true);
  assert.equal(canTransition('publish_ready', 'implemented'), true);
});

test('agent rejects illegal transitions', () => {
  assert.equal(canTransition('new', 'released'), false);
  assert.equal(canTransition('released', 'planned'), false);
});

test('transitionTask updates state and timestamp', () => {
  const updated = transitionTask({ taskId: 'tsk_1', status: 'new' }, 'planned', '2026-03-02T20:00:00Z');
  assert.equal(updated.status, 'planned');
  assert.equal(updated.updatedAt, '2026-03-02T20:00:00Z');
});

test('transitionTask throws on illegal transition', () => {
  assert.throws(
    () => transitionTask({ taskId: 'tsk_1', status: 'new' }, 'released'),
    /illegal transition/
  );
});
