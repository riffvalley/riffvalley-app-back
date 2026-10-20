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
        rules: { 'no-unused-vars': 'error' },
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
    assert.match(violation.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), fixture.contents);
  } finally {
    fs.rmSync(fixture.repositoryRoot, { recursive: true, force: true });
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

test('baseline comparison rejects new, stale, and duplicate diagnostics', () => {
  const baselineEntry = {
    rule: 'rule-a',
    path: 'src/old.ts',
    line: 4,
    column: 2,
    fingerprint: 'old',
  };
  const currentEntry = {
    rule: 'rule-b',
    path: 'src/new.ts',
    line: 8,
    column: 5,
    fingerprint: 'new',
  };

  const comparison = compareBaseline(
    [currentEntry],
    [baselineEntry, baselineEntry],
  );

  assert.deepEqual(comparison.newViolations, [currentEntry]);
  assert.deepEqual(comparison.staleEntries, [baselineEntry, baselineEntry]);
  assert.deepEqual(comparison.duplicateEntries, [baselineEntry]);
  assert.equal(violationKey(currentEntry), 'rule-b:src/new.ts:8:5:new');
});
