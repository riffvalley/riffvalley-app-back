const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectViolations,
  compareBaseline,
  discoverModules,
} = require('./structural-quality-gate');

function withRepository(run) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'riffvalley-structure-gate-'),
  );
  try {
    run(repositoryRoot);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
}

function writeFile(repositoryRoot, relativePath, contents = '') {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function moduleSource(className) {
  return `import { Module } from '@nestjs/common';\n@Module({})\nexport class ${className} {}`;
}

test('accepts module roots with allowed files, coherent subfolders, and tests in __tests__', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/editorial/articles/articles.module.ts',
      moduleSource('ArticlesModule'),
    );
    writeFile(repositoryRoot, 'src/editorial/articles/articles.controller.ts');
    writeFile(repositoryRoot, 'src/editorial/articles/articles.service.ts');
    writeFile(
      repositoryRoot,
      'src/editorial/articles/dto/create-article.dto.ts',
    );
    writeFile(
      repositoryRoot,
      'src/editorial/articles/__tests__/articles.service.spec.ts',
    );

    assert.equal(discoverModules(repositoryRoot).length, 1);
    assert.deepEqual(collectViolations(repositoryRoot), []);
  });
});

test('discovers and validates nested NestJS modules', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/editorial/lists/list.module.ts',
      moduleSource('ListsModule'),
    );
    writeFile(
      repositoryRoot,
      'src/editorial/lists/asignations/asignations.module.ts',
      moduleSource('AsignationsModule'),
    );
    writeFile(
      repositoryRoot,
      'src/editorial/lists/asignations/asignations.service.ts',
    );
    writeFile(
      repositoryRoot,
      'src/editorial/lists/asignations/__tests__/asignations.service.spec.ts',
    );

    assert.equal(discoverModules(repositoryRoot).length, 2);
    assert.deepEqual(collectViolations(repositoryRoot), []);
  });
});

test('reports misplaced specs and auxiliary files at module roots', () => {
  withRepository((repositoryRoot) => {
    writeFile(
      repositoryRoot,
      'src/editorial/lists/list.module.ts',
      moduleSource('ListsModule'),
    );
    writeFile(repositoryRoot, 'src/editorial/lists/list.service.spec.ts');
    writeFile(repositoryRoot, 'src/editorial/lists/list.helpers.ts');
    writeFile(repositoryRoot, 'src/editorial/lists/application/query.spec.ts');

    assert.deepEqual(collectViolations(repositoryRoot), [
      { rule: 'module-root-file', path: 'src/editorial/lists/list.helpers.ts' },
      {
        rule: 'module-root-file',
        path: 'src/editorial/lists/list.service.spec.ts',
      },
      {
        rule: 'spec-outside-tests',
        path: 'src/editorial/lists/application/query.spec.ts',
      },
      {
        rule: 'spec-outside-tests',
        path: 'src/editorial/lists/list.service.spec.ts',
      },
    ]);
  });
});

test('rejects violations that are absent from the exact-path baseline', () => {
  const current = [
    { rule: 'module-root-file', path: 'src/new/module/helper.ts' },
  ];
  const result = compareBaseline(current, []);

  assert.deepEqual(result.newViolations, current);
  assert.deepEqual(result.staleEntries, []);
});

test('rejects stale baseline entries after a violation is fixed', () => {
  const baseline = [
    { rule: 'spec-outside-tests', path: 'src/old/old.spec.ts' },
  ];
  const result = compareBaseline([], baseline);

  assert.deepEqual(result.newViolations, []);
  assert.deepEqual(result.staleEntries, baseline);
});
