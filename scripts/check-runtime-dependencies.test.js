'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkRuntimeDependencies } = require('./check-runtime-dependencies');

function fixture(manifest) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runtime-dependencies-'));
  mkdirSync(path.join(root, 'dist'));
  mkdirSync(path.join(root, 'node_modules', 'express'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(root, 'dist', 'main.js'), "require('express');\n");
  writeFileSync(
    path.join(root, 'node_modules', 'express', 'index.js'),
    'module.exports = {};\n',
  );
  return root;
}

test('accepts compiled modules declared as production dependencies', () => {
  const root = fixture({ dependencies: { express: '4.21.2' } });
  try {
    assert.deepEqual(checkRuntimeDependencies(root), {
      filesScanned: 1,
      moduleCount: 1,
      issues: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a module that is available but only declared for development', () => {
  const root = fixture({ devDependencies: { express: '4.21.2' } });
  try {
    const result = checkRuntimeDependencies(root);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /express is not declared in dependencies/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a declared production module that is not installed', () => {
  const root = fixture({ dependencies: { express: '4.21.2' } });
  try {
    rmSync(path.join(root, 'node_modules', 'express'), {
      recursive: true,
      force: true,
    });
    const result = checkRuntimeDependencies(root);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /cannot load express \(MODULE_NOT_FOUND\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
