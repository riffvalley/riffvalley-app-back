#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_SOURCE_ROOTS = ['src', 'apps', 'libs', 'test'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'dist',
  'node_modules',
  'coverage',
]);
const ALLOWED_MODULE_ROOT_FILE = /^.+\.(?:controller|module|service)\.ts$/;
const SPEC_FILE = /\.(?:spec|e2e-spec)\.ts$/;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        files.push(...listFiles(fullPath));
      }
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isNestModuleFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const namedModuleImports = new Set();
  const namespaceImports = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (statement.moduleSpecifier.text !== '@nestjs/common') continue;

    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === 'Module')
          namedModuleImports.add(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceImports.add(bindings.name.text);
    }
  }

  function isModuleDecorator(decorator) {
    const expression = decorator.expression;
    if (!ts.isCallExpression(expression)) return false;
    const callee = expression.expression;
    if (ts.isIdentifier(callee)) return namedModuleImports.has(callee.text);
    return (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'Module' &&
      ts.isIdentifier(callee.expression) &&
      namespaceImports.has(callee.expression.text)
    );
  }

  return sourceFile.statements.some((statement) => {
    if (!ts.isClassDeclaration(statement)) return false;
    const decorators = ts.canHaveDecorators(statement)
      ? (ts.getDecorators(statement) ?? [])
      : [];
    return decorators.some(isModuleDecorator);
  });
}

function discoverModules(repositoryRoot, sourceRoots = DEFAULT_SOURCE_ROOTS) {
  const moduleDirectories = new Set();
  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = path.resolve(repositoryRoot, sourceRoot);
    for (const filePath of listFiles(absoluteRoot)) {
      if (!filePath.endsWith('.module.ts')) continue;
      if (isNestModuleFile(filePath))
        moduleDirectories.add(path.dirname(filePath));
    }
  }

  return [...moduleDirectories].sort();
}

function collectViolations(repositoryRoot, sourceRoots = DEFAULT_SOURCE_ROOTS) {
  const files = sourceRoots.flatMap((sourceRoot) =>
    listFiles(path.resolve(repositoryRoot, sourceRoot)),
  );
  const violations = [];

  for (const moduleDirectory of discoverModules(repositoryRoot, sourceRoots)) {
    for (const entry of fs.readdirSync(moduleDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || ALLOWED_MODULE_ROOT_FILE.test(entry.name))
        continue;
      violations.push({
        rule: 'module-root-file',
        path: toPosixPath(
          path.relative(repositoryRoot, path.join(moduleDirectory, entry.name)),
        ),
      });
    }
  }

  for (const filePath of files) {
    if (!SPEC_FILE.test(filePath)) continue;
    const relativePath = path.relative(repositoryRoot, filePath);
    if (relativePath.split(path.sep).includes('__tests__')) continue;
    violations.push({
      rule: 'spec-outside-tests',
      path: toPosixPath(relativePath),
    });
  }

  return violations.sort((left, right) =>
    `${left.rule}:${left.path}`.localeCompare(`${right.rule}:${right.path}`),
  );
}

function violationKey(violation) {
  return `${violation.rule}:${violation.path}`;
}

function compareBaseline(violations, baselineEntries) {
  const currentByKey = new Map(
    violations.map((entry) => [violationKey(entry), entry]),
  );
  const baselineByKey = new Map();
  const duplicateEntries = [];

  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    if (baselineByKey.has(key)) duplicateEntries.push(entry);
    baselineByKey.set(key, entry);
  }

  return {
    allowed: violations.filter((entry) =>
      baselineByKey.has(violationKey(entry)),
    ),
    newViolations: violations.filter(
      (entry) => !baselineByKey.has(violationKey(entry)),
    ),
    staleEntries: baselineEntries.filter(
      (entry) => !currentByKey.has(violationKey(entry)),
    ),
    duplicateEntries,
  };
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const baselinePath = path.join(
    __dirname,
    'structural-quality-gate.baseline.json',
  );

  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const modules = discoverModules(repositoryRoot);
    const violations = collectViolations(repositoryRoot);
    const comparison = compareBaseline(violations, baseline.violations ?? []);

    console.log(
      `Structural gate: ${modules.length} NestJS modules; ${violations.length} existing violations; ${comparison.newViolations.length} new; ${comparison.staleEntries.length} stale baseline entries.`,
    );
    for (const violation of comparison.allowed) {
      console.log(`BASELINE ${violation.rule}: ${violation.path}`);
    }
    for (const violation of comparison.newViolations) {
      console.error(`NEW ${violation.rule}: ${violation.path}`);
    }
    for (const entry of comparison.staleEntries) {
      console.error(`STALE baseline ${entry.rule}: ${entry.path}`);
    }
    for (const entry of comparison.duplicateEntries) {
      console.error(`DUPLICATE baseline ${entry.rule}: ${entry.path}`);
    }

    if (
      comparison.newViolations.length ||
      comparison.staleEntries.length ||
      comparison.duplicateEntries.length
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Structural gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  compareBaseline,
  collectViolations,
  discoverModules,
};
