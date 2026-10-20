const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ESLint } = require('eslint');

const {
  collectViolations,
  compareBaseline,
  violationKey,
} = require('./eslint-quality-gate');

async function lintFixture(contents) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-eslint-gate-'));
  const filePath = path.join(repositoryRoot, 'fixture.js');
  fs.writeFileSync(filePath, contents);

  try {
    const eslint = new ESLint({
      cwd: repositoryRoot,
      useEslintrc: false,
      fix: false,
      baseConfig: {
        env: { es2021: true },
        parserOptions: { ecmaVersion: 2022 },
        rules: { 'no-unused-vars': 'error', 'no-extra-semi': 'error' },
      },
    });
    const [result] = await eslint.lintFiles([filePath]);
    return { repositoryRoot, filePath, result, contents };
  } catch (error) {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
    throw error;
  }
}

test('reports a known ESLint rule and location without changing the source', async () => {
  const fixture = await lintFixture('const unused = 1;\n');
  try {
    assert.equal(fixture.result.errorCount, 1);
    const [violation] = collectViolations(fixture.repositoryRoot, [fixture.result]);
    assert.equal(violation.rule, 'no-unused-vars');
    assert.equal(violation.path, 'fixture.js');
    assert.equal(violation.line, 1);
    assert.equal(violation.column, 7);
    assert.equal(violation.occurrence, 0);
    assert.match(violation.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), fixture.contents);
  } finally {
    fs.rmSync(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('keeps diagnostic identity when unrelated lines are inserted before it', async () => {
  const before = await lintFixture('const unused = 1;\n');
  const after = await lintFixture('// unrelated\n\nconst unused = 1;\n');
  try {
    const [baselineEntry] = collectViolations(before.repositoryRoot, [before.result]);
    const [currentEntry] = collectViolations(after.repositoryRoot, [after.result]);
    assert.equal(currentEntry.line, 3);
    assert.equal(currentEntry.fingerprint, baselineEntry.fingerprint);
    assert.equal(currentEntry.occurrence, baselineEntry.occurrence);
    assert.deepEqual(compareBaseline([currentEntry], [baselineEntry]), {
      newViolations: [],
      staleEntries: [],
      duplicateEntries: [],
    });
  } finally {
    fs.rmSync(before.repositoryRoot, { recursive: true, force: true });
    fs.rmSync(after.repositoryRoot, { recursive: true, force: true });
  }
});

test('accepts a clean ESLint fixture', async () => {
  const fixture = await lintFixture('const used = 1;\nconsole.log(used);\n');
  try {
    assert.equal(fixture.result.errorCount, 0);
    assert.deepEqual(collectViolations(fixture.repositoryRoot, [fixture.result]), []);
  } finally {
    fs.rmSync(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('distinguishes repeated identical diagnostics by occurrence', () => {
  const first = { rule: 'rule-a', path: 'src/file.ts', line: 4, column: 2, fingerprint: 'same', occurrence: 0 };
  const second = { ...first, line: 9, occurrence: 1 };
  const corrected = { ...first, line: 12, occurrence: 2 };
  const comparison = compareBaseline([first, second], [first, second, corrected]);

  assert.deepEqual(comparison.newViolations, []);
  assert.deepEqual(comparison.staleEntries, [corrected]);
  assert.deepEqual(comparison.duplicateEntries, []);
  assert.equal(violationKey(first), 'rule-a:src/file.ts:same:0');
});

test('assigns stable ordinals to identical lint findings in a fixture', async () => {
  const before = await lintFixture('run();; next();;\n');
  const after = await lintFixture('// unrelated\nrun();; next();;\n');
  try {
    const beforeViolations = collectViolations(before.repositoryRoot, [before.result]);
    const afterViolations = collectViolations(after.repositoryRoot, [after.result]);
    assert.equal(beforeViolations.length, 2);
    assert.deepEqual(beforeViolations.map(({ occurrence }) => occurrence).sort(), [0, 1]);
    assert.deepEqual(afterViolations.map(({ occurrence }) => occurrence).sort(), [0, 1]);
    assert.deepEqual(
      afterViolations.map(({ fingerprint, occurrence }) => `${fingerprint}:${occurrence}`).sort(),
      beforeViolations.map(({ fingerprint, occurrence }) => `${fingerprint}:${occurrence}`).sort(),
    );
    assert.deepEqual(compareBaseline(afterViolations, beforeViolations), {
      newViolations: [],
      staleEntries: [],
      duplicateEntries: [],
    });
  } finally {
    fs.rmSync(before.repositoryRoot, { recursive: true, force: true });
    fs.rmSync(after.repositoryRoot, { recursive: true, force: true });
  }
});

test('detects new identical occurrences, corrected diagnostics, and duplicate baseline keys', () => {
  const first = { rule: 'rule-a', path: 'src/file.ts', line: 4, column: 2, fingerprint: 'same', occurrence: 0 };
  const second = { ...first, line: 9, occurrence: 1 };
  const added = { ...first, line: 12, occurrence: 2 };
  const removed = { rule: 'rule-b', path: 'src/file.ts', line: 14, column: 2, fingerprint: 'fixed', occurrence: 0 };
  const comparison = compareBaseline([first, second, added], [first, second, removed, first]);

  assert.deepEqual(comparison.newViolations, [added]);
  assert.deepEqual(comparison.staleEntries, [removed, first]);
  assert.deepEqual(comparison.duplicateEntries, [first]);
});
