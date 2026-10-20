const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectViolations,
  compareBaseline,
  violationKey,
} = require('./type-safety-quality-gate');

function withRepository(run) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'riffvalley-type-safety-gate-'),
  );
  try {
    run(repositoryRoot);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
}

function writeFile(repositoryRoot, relativePath, contents) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

test('detects explicit any in types and assertions, but accepts expect.any', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/feature.ts',
      'let payload: any;\nconst forced = payload as any;\nexpect.any(Date);\n',
    );

    const violations = collectViolations(repositoryRoot, ['src']);

    assert.deepEqual(
      violations.map(({ rule, path: filePath, line, column }) => ({
        rule,
        path: filePath,
        line,
        column,
      })),
      [
        { rule: 'explicit-any', path: 'src/feature.ts', line: 1, column: 14 },
        { rule: 'explicit-any', path: 'src/feature.ts', line: 2, column: 27 },
      ],
    );
  });
});

test('detects chained unknown assertions while allowing a single unknown assertion', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/feature.ts',
      'const opaque = value as unknown;\nconst forced = value as unknown as Feature;\nconst wrapped = (value as unknown) as Feature;\n',
    );

    const violations = collectViolations(repositoryRoot, ['src']);

    assert.equal(violations.length, 2);
    assert.deepEqual(
      violations.map(({ rule, line, column }) => ({ rule, line, column })),
      [
        { rule: 'double-type-assertion', line: 2, column: 16 },
        { rule: 'double-type-assertion', line: 3, column: 17 },
      ],
    );
  });
});

test('detects TypeScript and ESLint suppression directives only in comments', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'test/feature.spec.ts',
      [
        '// @ts-ignore reason',
        '/* @ts-expect-error expected */',
        '/*',
        ' * @ts-nocheck',
        ' */',
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '// eslint-disable-line @typescript-eslint/no-explicit-any',
        '/* eslint-disable */',
        'const text = "@ts-ignore eslint-disable";',
        '// explanation: avoid @ts-ignore in real code',
      ].join('\n'),
    );

    const violations = collectViolations(repositoryRoot, ['test']);

    assert.deepEqual(
      violations.map(({ rule, line, column }) => ({ rule, line, column })),
      [
        { rule: 'typescript-suppression', line: 1, column: 4 },
        { rule: 'typescript-suppression', line: 2, column: 4 },
        { rule: 'typescript-suppression', line: 4, column: 4 },
        { rule: 'typescript-suppression', line: 6, column: 4 },
        { rule: 'typescript-suppression', line: 7, column: 4 },
        { rule: 'typescript-suppression', line: 8, column: 4 },
      ],
    );
  });
});

test('preserves exact positions for suppression directives in CRLF comments', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/feature.ts',
      '/*\r\n * @ts-nocheck\r\n */\r\n',
    );

    const violations = collectViolations(repositoryRoot, ['src']);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].line, 2);
    assert.equal(violations[0].column, 4);
  });
});

test('emits deterministic exact identifiers with rule, path, location, and fingerprint', () => {
  withRepository((repositoryRoot) => {
    writeFile(repositoryRoot, 'src/feature.ts', 'const value: any;\n');

    const first = collectViolations(repositoryRoot, ['src']);
    const second = collectViolations(repositoryRoot, ['src']);

    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first[0]), [
      'rule',
      'path',
      'line',
      'column',
      'fingerprint',
    ]);
    assert.match(violationKey(first[0]), /^explicit-any:src\/feature\.ts:1:14:/);
  });
});

test('rejects new, stale, and duplicate exact baseline entries', () => {
  const existing = {
    rule: 'explicit-any',
    path: 'src/old.ts',
    line: 1,
    column: 10,
    fingerprint: 'fingerprint-old',
  };
  const introduced = {
    rule: 'double-type-assertion',
    path: 'test/new.spec.ts',
    line: 4,
    column: 18,
    fingerprint: 'fingerprint-new',
  };
  const baseline = [existing, existing];

  const comparison = compareBaseline([introduced], baseline);

  assert.deepEqual(comparison.newViolations, [introduced]);
  assert.deepEqual(comparison.staleEntries, baseline);
  assert.deepEqual(comparison.duplicateEntries, [existing]);
});
