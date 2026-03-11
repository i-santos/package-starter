const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canTransition,
  createTaskRecord,
  attachTaskRecord,
  readTaskRecord,
  transitionTask,
  TASK_STATES
} = require('../lib');

test('workflow exposes canonical task states', () => {
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

test('workflow allows forward lifecycle transitions', () => {
  assert.equal(canTransition('new', 'planned'), true);
  assert.equal(canTransition('planned', 'tdd_ready'), true);
  assert.equal(canTransition('publish_ready', 'released'), true);
});

test('workflow allows controlled rollback transitions', () => {
  assert.equal(canTransition('verified', 'implemented'), true);
  assert.equal(canTransition('publish_ready', 'implemented'), true);
});

test('workflow rejects illegal transitions', () => {
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

test('shared task contract can be created and attached to a container task', () => {
  const record = createTaskRecord({ id: 'task-1', title: 'Task 1' }, '2026-03-10T00:00:00.000Z');
  const attached = attachTaskRecord({ id: 'task-1', metadata: {} }, record);

  assert.equal(record.taskId, 'task-1');
  assert.equal(record.status, 'new');
  assert.equal(attached.metadata.workflow.taskId, 'task-1');
  assert.equal(readTaskRecord(attached).taskId, 'task-1');
});
