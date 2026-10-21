#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const DEFAULT_SOURCE_ROOTS = ['src', 'apps', 'libs', 'test'];
const IGNORED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules', 'coverage']);
const SUPPRESSION_DIRECTIVE = /^(?:@ts-(?:ignore|expect-error|nocheck)|eslint-disable(?:-next-line|-line)?)\b/;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listTypeScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        files.push(...listTypeScriptFiles(fullPath));
      }
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function fingerprint(value, sourceLine) {
  const normalized = JSON.stringify({
    value: value.replace(/\s+/g, ' ').trim(),
    sourceLine: sourceLine.replace(/\s+/g, ' ').trim(),
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function makeViolation(rule, repositoryRoot, filePath, sourceFile, position, text) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  const sourceLine = sourceFile.text.split(/\r\n|\n|\r/)[line] ?? '';
  return {
    rule,
    path: toPosixPath(path.relative(repositoryRoot, filePath)),
    line: line + 1,
    column: character + 1,
    fingerprint: fingerprint(text, sourceLine),
  };
}

function collectCommentViolations(repositoryRoot, filePath, sourceFile) {
  const violations = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    sourceFile.text,
  );

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }

    const commentStart = scanner.getTokenPos();
    const commentText = scanner.getTokenText();
    const lines = commentText.split(/\r\n|\n|\r/);
    let lineOffset = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let content = line;
      if (index === 0) content = content.replace(/^\/\//, '').replace(/^\/\*/, '');
      if (index === lines.length - 1) content = content.replace(/\*\/$/, '');
      const cleanedLine = content.replace(/^\s*\*?\s*/, '');
      const match = SUPPRESSION_DIRECTIVE.exec(cleanedLine);
      if (match) {
        const localOffset = line.indexOf(match[0]);
        const position = commentStart + lineOffset + Math.max(localOffset, 0);
        violations.push(
          makeViolation(
            'typescript-suppression',
            repositoryRoot,
            filePath,
            sourceFile,
            position,
            match[0].toLowerCase(),
          ),
        );
      }

      lineOffset += line.length;
      const lineBreak = commentText.slice(lineOffset).match(/^\r\n|^\r|^\n/);
      if (lineBreak) lineOffset += lineBreak[0].length;
    }
  }

  return violations;
}

function collectFileViolations(repositoryRoot, filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = collectCommentViolations(repositoryRoot, filePath, sourceFile);

  function unwrapParentheses(node) {
    let current = node;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return current;
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      violations.push(
        makeViolation(
          'explicit-any',
          repositoryRoot,
          filePath,
          sourceFile,
          node.getStart(sourceFile),
          node.getText(sourceFile),
        ),
      );
    }

    const assertedExpression = ts.isAsExpression(node)
      ? unwrapParentheses(node.expression)
      : undefined;
    if (
      ts.isAsExpression(node) &&
      assertedExpression &&
      ts.isAsExpression(assertedExpression) &&
      assertedExpression.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      violations.push(
        makeViolation(
          'double-type-assertion',
          repositoryRoot,
          filePath,
          sourceFile,
          node.getStart(sourceFile),
          node.getText(sourceFile),
        ),
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function violationKey(violation) {
  return [
    violation.rule,
    violation.path,
    violation.fingerprint,
    violation.occurrence,
  ].join(':');
}

function collectViolations(repositoryRoot, sourceRoots = DEFAULT_SOURCE_ROOTS) {
  const violations = sourceRoots
    .flatMap((sourceRoot) =>
      listTypeScriptFiles(path.resolve(repositoryRoot, sourceRoot)),
    )
    .flatMap((filePath) => collectFileViolations(repositoryRoot, filePath))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.line - right.line ||
        left.column - right.column ||
        left.rule.localeCompare(right.rule),
    );

  const occurrences = new Map();
  const identified = violations.map((violation) => {
    const signature = `${violation.rule}:${violation.path}:${violation.fingerprint}`;
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    return { ...violation, occurrence };
  });
  return identified.sort((left, right) =>
    [left.rule, left.path, left.line, left.column, left.fingerprint]
      .join(':')
      .localeCompare(
        [right.rule, right.path, right.line, right.column, right.fingerprint].join(':'),
      ),
  );
}

function compareBaseline(violations, baselineEntries) {
  const currentCounts = new Map();
  const baselineCounts = new Map();
  const duplicates = [];

  for (const violation of violations) {
    const key = violationKey(violation);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }

  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    if (baselineCounts.has(key)) duplicates.push(entry);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }

  const currentSeen = new Map();
  const baselineSeen = new Map();
  const newViolations = [];
  const staleEntries = [];
  for (const violation of violations) {
    const key = violationKey(violation);
    const seen = currentSeen.get(key) ?? 0;
    if (seen >= (baselineCounts.get(key) ?? 0)) newViolations.push(violation);
    currentSeen.set(key, seen + 1);
  }
  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    const seen = baselineSeen.get(key) ?? 0;
    if (seen >= (currentCounts.get(key) ?? 0)) staleEntries.push(entry);
    baselineSeen.set(key, seen + 1);
  }

  return {
    newViolations,
    staleEntries,
    duplicateEntries: duplicates,
  };
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const baselinePath = path.join(__dirname, 'type-safety-quality-gate.baseline.json');

  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (baseline.version !== 2 || !Array.isArray(baseline.violations)) {
      throw new Error('Unsupported or malformed baseline (expected version 2 and violations array).');
    }

    const violations = collectViolations(repositoryRoot);
    const comparison = compareBaseline(violations, baseline.violations);
    console.log(
      `Type safety gate: ${violations.length} violations; ${comparison.newViolations.length} new; ${comparison.staleEntries.length} stale; ${comparison.duplicateEntries.length} duplicate baseline entries.`,
    );

    for (const violation of comparison.newViolations) {
      console.error(`NEW ${violation.rule}: ${violation.path}:${violation.line}:${violation.column}`);
    }
    for (const entry of comparison.staleEntries) {
      console.error(`STALE ${entry.rule}: ${entry.path}:${entry.line}:${entry.column}`);
    }
    for (const entry of comparison.duplicateEntries) {
      console.error(`DUPLICATE ${entry.rule}: ${entry.path}:${entry.line}:${entry.column}`);
    }

    if (
      comparison.newViolations.length ||
      comparison.staleEntries.length ||
      comparison.duplicateEntries.length
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Type safety gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { collectViolations, compareBaseline, violationKey };
