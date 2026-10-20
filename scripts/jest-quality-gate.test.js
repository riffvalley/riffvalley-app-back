const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runCLI } = require('jest');

async function runJestFixture(testSource) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-jest-gate-'));
  const testPath = path.join(projectRoot, 'fixture.test.js');
  fs.writeFileSync(testPath, testSource);

  try {
    const config = {
      rootDir: projectRoot,
      testEnvironment: 'node',
      testMatch: ['<rootDir>/fixture.test.js'],
      transform: {},
    };
    const { results } = await runCLI(
      {
        config: JSON.stringify(config),
        runInBand: true,
        runTestsByPath: true,
        _: [testPath],
      },
      [projectRoot],
    );

    return { exitCode: results.success ? 0 : 1, success: results.success };
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

test('Jest fixture passes and a real failed expectation returns a failing status', async () => {
  const passing = await runJestFixture(
    "test('passes', () => expect(2 + 2).toBe(4));\n",
  );
  const failing = await runJestFixture(
    "test('fails', () => expect(2 + 2).toBe(5));\n",
  );

  assert.deepEqual(passing, { success: true, exitCode: 0 });
  assert.deepEqual(failing, { success: false, exitCode: 1 });
});
