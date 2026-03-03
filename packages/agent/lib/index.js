const TASK_STATES = Object.freeze([
  'new',
  'planned',
  'tdd_ready',
  'implemented',
  'verified',
  'publish_ready',
  'released'
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  new: ['planned'],
  planned: ['tdd_ready'],
  tdd_ready: ['implemented'],
  implemented: ['verified'],
  verified: ['publish_ready', 'implemented'],
  publish_ready: ['released', 'implemented'],
  released: []
});

function isTaskState(value) {
  return TASK_STATES.includes(value);
}

function canTransition(from, to) {
  if (!isTaskState(from) || !isTaskState(to)) {
    return false;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

function transitionTask(task, nextStatus, nowIso = new Date().toISOString()) {
  if (!task || typeof task !== 'object') {
    throw new Error('task must be an object.');
  }

  if (!isTaskState(task.status)) {
    throw new Error(`invalid current task status: ${task.status}`);
  }

  if (!isTaskState(nextStatus)) {
    throw new Error(`invalid next task status: ${nextStatus}`);
  }

  if (!canTransition(task.status, nextStatus)) {
    throw new Error(`illegal transition: ${task.status} -> ${nextStatus}`);
  }

  return {
    ...task,
    status: nextStatus,
    updatedAt: nowIso
  };
}

module.exports = {
  TASK_STATES,
  ALLOWED_TRANSITIONS,
  isTaskState,
  canTransition,
  transitionTask
};
