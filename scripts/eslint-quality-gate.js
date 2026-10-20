#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function fingerprint(diagnostic, sourceLine) {
  const normalized = JSON.stringify({
    rule: diagnostic.ruleId ?? 'eslint',
    severity: diagnostic.severity,
    message: diagnostic.message.replace(/\s+/g, ' ').trim(),
    nodeType: diagnostic.nodeType ?? null,
    messageId: diagnostic.messageId ?? null,
    sourceLine: sourceLine ?? null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function collectViolations(repositoryRoot, eslintResults) {
  const violations = eslintResults.flatMap((result) => {
    const occurrences = new Map();
    const sourceLines = (result.source ?? fs.readFileSync(result.filePath, 'utf8')).split(/\r?\n/);
    return result.messages
      .map((diagnostic) => {
        const sourceLine = diagnostic.line ? sourceLines[diagnostic.line - 1] : undefined;
        const fingerprintValue = fingerprint(diagnostic, sourceLine);
        const signature = `${diagnostic.ruleId ?? 'eslint'}:${fingerprintValue}`;
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        return {
          rule: diagnostic.ruleId ?? 'eslint',
          path: toPosixPath(path.relative(repositoryRoot, result.filePath)),
          line: diagnostic.line ?? 1,
          column: diagnostic.column ?? 1,
          fingerprint: fingerprintValue,
          occurrence,
        };
      });
  });
  return violations.sort((left, right) =>
    [left.rule, left.path, left.line, left.column, left.fingerprint]
      .join(':')
      .localeCompare([right.rule, right.path, right.line, right.column, right.fingerprint].join(':')),
  );
}

function violationKey(violation) {
  return [
    violation.rule,
    violation.path,
    violation.fingerprint,
    violation.occurrence,
  ].join(':');
}

function compareBaseline(violations, baselineEntries) {
  const currentCounts = new Map();
  const baselineCounts = new Map();
  const duplicateEntries = [];

  for (const violation of violations) {
    const key = violationKey(violation);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }

  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    if (baselineCounts.has(key)) duplicateEntries.push(entry);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }

  const currentSeen = new Map();
  const baselineSeen = new Map();
  const newViolations = [];
  const staleEntries = [];
  for (const violation of violations) {
    const key = violationKey(violation);
    const seen = currentSeen.get(key) ?? 0;
    if (seen >= (baselineCounts.get(key) ?? 0)) {
      newViolations.push(violation);
    }
    currentSeen.set(key, seen + 1);
  }
  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    const seen = baselineSeen.get(key) ?? 0;
    if (seen >= (currentCounts.get(key) ?? 0)) {
      staleEntries.push(entry);
    }
    baselineSeen.set(key, seen + 1);
  }

  return {
    newViolations,
    staleEntries,
    duplicateEntries,
  };
}

async function runEslint(repositoryRoot) {
  const eslint = new ESLint({ cwd: repositoryRoot, fix: false, cache: false });
  return eslint.lintFiles(['src/**/*.ts', 'test/**/*.ts']);
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const baselinePath = path.join(__dirname, 'eslint-quality-gate.baseline.json');

  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (baseline.version !== 2 || !Array.isArray(baseline.violations)) {
      throw new Error('Unsupported or malformed baseline (expected version 2 and violations array).');
    }

    const results = await runEslint(repositoryRoot);
    const violations = collectViolations(repositoryRoot, results);
    const comparison = compareBaseline(violations, baseline.violations);
    const byRuleAndPath = new Map();
    for (const violation of violations) {
      const group = `${violation.rule} ${violation.path}`;
      byRuleAndPath.set(group, (byRuleAndPath.get(group) ?? 0) + 1);
    }

    console.log(
      `ESLint quality gate: ${violations.length} diagnostics; ${comparison.newViolations.length} new; ${comparison.staleEntries.length} stale; ${comparison.duplicateEntries.length} duplicate baseline entries.`,
    );
    for (const [group, count] of [...byRuleAndPath].sort(([left], [right]) => left.localeCompare(right))) {
      console.log(`  ${count} ${group}`);
    }

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
    console.error(`ESLint quality gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { collectViolations, compareBaseline, fingerprint, violationKey };
