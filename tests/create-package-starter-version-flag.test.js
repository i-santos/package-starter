const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { run } = require('../packages/npmstack/lib/run');

test('npmstack prints version with --version and -v', async () => {
  const packageJsonPath = path.resolve(__dirname, '..', 'packages', 'npmstack', 'package.json');
  const expectedVersion = require(packageJsonPath).version;
  const outputs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    outputs.push(args.join(' '));
  };

  try {
    await run(['--version']);
    await run(['-v']);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(outputs, [expectedVersion, expectedVersion]);
});
