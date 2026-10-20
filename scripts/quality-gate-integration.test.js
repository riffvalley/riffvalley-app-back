const assert = require('node:assert/strict');
const test = require('node:test');

const { scripts } = require('../package.json');

const VERIFY_STEPS = [
  'yarn test:quality-integration',
  'yarn test:quality-structure',
  'yarn quality:structure',
  'yarn test:quality-types',
  'yarn quality:types',
  'yarn test:quality-lint',
  'yarn quality:lint',
  'yarn test:quality-typecheck',
  'yarn quality:typecheck',
  'yarn test:quality-build',
  'yarn build',
  'yarn test:quality-tests',
  'yarn test:unit --runInBand',
];

test('verify runs every documented control in order and fails fast on a nonzero command', () => {
  const verifyScript = scripts.verify;
  const actualSteps = verifyScript.split(' && ');

  assert.deepEqual(actualSteps, VERIFY_STEPS);
  assert.ok(
    actualSteps.every((step) => {
      const scriptName = step.slice('yarn '.length).split(' ')[0];
      return Boolean(scripts[scriptName]);
    }),
  );
  assert.equal(actualSteps.some((step) => step.startsWith('yarn test:e2e')), false);
  assert.equal(verifyScript.includes('--fix'), false);
  assert.equal(verifyScript.includes('baseline'), false);
});
