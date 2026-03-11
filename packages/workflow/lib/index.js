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

const DEFAULT_ARTIFACTS = Object.freeze({
  planFile: '',
  tddFile: '',
  implementationFile: '',
  reportFile: ''
});

const DEFAULT_CHECKS = Object.freeze({
  unit: 'pending',
  integration: 'pending',
  e2e: 'not_required'
});

const DEFAULT_RELEASE = Object.freeze({
  prNumber: 0,
  mergeCommit: '',
  published: false
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

function createTaskRecord(input = {}, nowIso = new Date().toISOString()) {
  return {
    taskId: input.taskId || input.id || '',
    title: input.title || input.taskId || input.id || '',
    type: input.type || 'task',
    branch: input.branch || '',
    workspace: input.workspace || '',
    status: isTaskState(input.status) ? input.status : 'new',
    createdAt: input.createdAt || nowIso,
    updatedAt: input.updatedAt || nowIso,
    artifacts: {
      ...DEFAULT_ARTIFACTS,
      ...(input.artifacts || {})
    },
    checks: {
      ...DEFAULT_CHECKS,
      ...(input.checks || {})
    },
    release: {
      ...DEFAULT_RELEASE,
      ...(input.release || {})
    }
  };
}

function readTaskRecord(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('task record source must be an object.');
  }

  if (value.metadata && value.metadata.workflow) {
    return createTaskRecord({
      ...value.metadata.workflow,
      taskId: value.metadata.workflow.taskId || value.id || ''
    });
  }

  return createTaskRecord(value);
}

function attachTaskRecord(container, record) {
  if (!container || typeof container !== 'object') {
    throw new Error('task container must be an object.');
  }

  return {
    ...container,
    metadata: {
      ...(container.metadata || {}),
      workflow: createTaskRecord(record)
    }
  };
}

module.exports = {
  TASK_STATES,
  ALLOWED_TRANSITIONS,
  isTaskState,
  canTransition,
  transitionTask,
  createTaskRecord,
  readTaskRecord,
  attachTaskRecord
};
