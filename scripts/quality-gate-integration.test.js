const assert = require('node:assert/strict');
const test = require('node:test');

const { scripts } = require('../package.json');

const VERIFY_STEPS = [
  'pnpm run test:quality-integration',
  'pnpm run test:quality-structure',
  'pnpm run quality:structure',
  'pnpm run test:quality-types',
  'pnpm run quality:types',
  'pnpm run test:quality-lint',
  'pnpm run quality:lint',
  'pnpm run test:quality-typecheck',
  'pnpm run quality:typecheck',
  'pnpm run test:quality-build',
  'pnpm run test:runtime-dependencies',
  'pnpm run build',
  'pnpm run test:quality-tests',
  'pnpm run test:unit --runInBand',
];

test('verify runs every documented control in order and fails fast on a nonzero command', () => {
  const verifyScript = scripts.verify;
  const actualSteps = verifyScript.split(' && ');

  assert.deepEqual(actualSteps, VERIFY_STEPS);
  assert.ok(
    actualSteps.every((step) => {
      const scriptName = step.slice('pnpm run '.length).split(' ')[0];
      return Boolean(scripts[scriptName]);
    }),
  );
  assert.equal(actualSteps.some((step) => step.startsWith('pnpm run test:e2e')), false);
  assert.equal(verifyScript.includes('--fix'), false);
  assert.equal(verifyScript.includes('baseline'), false);
});
