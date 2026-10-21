const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectDiagnostics,
  compareBaseline,
  diagnosticKey,
} = require('./typecheck-quality-gate');

function withProject(run) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-typecheck-gate-'));
  try {
    fs.mkdirSync(path.join(projectRoot, 'src'));
    fs.writeFileSync(
      path.join(projectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2021', module: 'commonjs', strict: true },
        include: ['src/**/*.ts'],
      }),
    );
    run(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

test('accepts a clean TypeScript project without invoking build or Jest', () => {
  withProject((projectRoot) => {
    fs.writeFileSync(path.join(projectRoot, 'src/index.ts'), 'const answer: number = 42;\n');
    assert.deepEqual(
      collectDiagnostics(path.join(projectRoot, 'tsconfig.json'), projectRoot),
      [],
    );
  });
});

test('reports a TypeScript error with a stable code, path, and location', () => {
  withProject((projectRoot) => {
    fs.writeFileSync(path.join(projectRoot, 'src/index.ts'), 'const answer: number = "wrong";\n');
    const diagnostics = collectDiagnostics(
      path.join(projectRoot, 'tsconfig.json'),
      projectRoot,
    );

    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, 2322);
    assert.equal(diagnostics[0].path, 'src/index.ts');
    assert.equal(diagnostics[0].line, 1);
    assert.ok(diagnostics[0].column > 1);
    assert.match(diagnostics[0].fingerprint, /^[a-f0-9]{64}$/);
  });
});

test('baseline comparison rejects new, stale, and duplicate diagnostics', () => {
  const existing = {
    code: 2322,
    path: 'src/old.ts',
    line: 1,
    column: 1,
    fingerprint: 'old',
  };
  const current = {
    code: 2345,
    path: 'src/new.ts',
    line: 2,
    column: 4,
    fingerprint: 'new',
  };
  const comparison = compareBaseline([current], [existing, existing]);

  assert.deepEqual(comparison.newDiagnostics, [current]);
  assert.deepEqual(comparison.staleEntries, [existing, existing]);
  assert.deepEqual(comparison.duplicateEntries, [existing]);
  assert.equal(diagnosticKey(current), '2345:src/new.ts:2:4:new');
});
