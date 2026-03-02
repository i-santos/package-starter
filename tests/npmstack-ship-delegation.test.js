const test = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../packages/npmstack/lib/run');

test('npmstack delegates ship subcommand to @i-santos/ship runner', async () => {
  const calls = [];
  const runShip = async (argv, dependencies) => {
    calls.push({ argv, dependencies });
  };

  await run(['ship', 'release-cycle', '--yes'], { runShip });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argv, ['release-cycle', '--yes']);
});

test('npmstack no longer accepts legacy release-cycle command directly', async () => {
  await assert.rejects(
    () => run(['release-cycle', '--yes']),
    /Invalid argument: release-cycle/
  );
});

