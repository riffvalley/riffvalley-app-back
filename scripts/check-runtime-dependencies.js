#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire, isBuiltin } = require('node:module');

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function runtimeRequires(root) {
  const distRoot = path.join(root, 'dist');
  if (!fs.existsSync(distRoot)) {
    throw new Error(
      'No existe dist/. Ejecuta el build antes de comprobar dependencias.',
    );
  }

  const files = [];
  const requires = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile() && file.endsWith('.js')) {
        files.push(file);
        const source = fs.readFileSync(file, 'utf8');
        const matcher = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
        for (const match of source.matchAll(matcher)) {
          const specifier = match[2];
          if (
            specifier.startsWith('.') ||
            specifier.startsWith('/') ||
            isBuiltin(specifier)
          ) {
            continue;
          }
          const locations = requires.get(specifier) ?? new Set();
          locations.add(file);
          requires.set(specifier, locations);
        }
      }
    }
  };
  visit(distRoot);

  return { files, requires };
}

function checkRuntimeDependencies(root = process.cwd()) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const productionDependencies = new Set(
    Object.keys(manifest.dependencies ?? {}),
  );
  const { files, requires } = runtimeRequires(root);
  const issues = [];

  for (const [specifier, locations] of requires) {
    const name = packageName(specifier);
    for (const file of locations) {
      const relativeFile = path.relative(root, file);
      if (!productionDependencies.has(name)) {
        issues.push(
          `${relativeFile}: ${specifier} is not declared in dependencies`,
        );
        continue;
      }
      try {
        createRequire(file)(specifier);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? ` (${error.code})`
            : '';
        issues.push(`${relativeFile}: cannot load ${specifier}${code}`);
      }
    }
  }

  return { filesScanned: files.length, moduleCount: requires.size, issues };
}

if (require.main === module) {
  const result = checkRuntimeDependencies(process.argv[2] || process.cwd());
  if (result.issues.length) {
    console.error(
      `Runtime dependency gate failed (${result.issues.length} issue(s)):\n${result.issues.join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Runtime dependency gate: ${result.filesScanned} compiled files; ${result.moduleCount} external modules are declared for production and load.`,
    );
  }
}

module.exports = { checkRuntimeDependencies };
