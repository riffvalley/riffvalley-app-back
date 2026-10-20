#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function fingerprint(diagnostic) {
  const normalized = JSON.stringify({
    rule: diagnostic.ruleId,
    severity: diagnostic.severity,
    message: diagnostic.message.replace(/\s+/g, ' ').trim(),
    line: diagnostic.line,
    column: diagnostic.column,
    endLine: diagnostic.endLine ?? null,
    endColumn: diagnostic.endColumn ?? null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function collectViolations(repositoryRoot, eslintResults) {
  return eslintResults
    .flatMap((result) =>
      result.messages.map((diagnostic) => ({
        rule: diagnostic.ruleId ?? 'eslint',
        path: toPosixPath(path.relative(repositoryRoot, result.filePath)),
        line: diagnostic.line ?? 1,
        column: diagnostic.column ?? 1,
        fingerprint: fingerprint(diagnostic),
      })),
    )
    .sort((left, right) => violationKey(left).localeCompare(violationKey(right)));
}

function violationKey(violation) {
  return [
    violation.rule,
    violation.path,
    violation.line,
    violation.column,
    violation.fingerprint,
  ].join(':');
}

function compareBaseline(violations, baselineEntries) {
  const currentKeys = new Set(violations.map(violationKey));
  const baselineKeys = new Set();
  const duplicateEntries = [];

  for (const entry of baselineEntries) {
    const key = violationKey(entry);
    if (baselineKeys.has(key)) duplicateEntries.push(entry);
    baselineKeys.add(key);
  }

  return {
    newViolations: violations.filter((entry) => !baselineKeys.has(violationKey(entry))),
    staleEntries: baselineEntries.filter((entry) => !currentKeys.has(violationKey(entry))),
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
    if (baseline.version !== 1 || !Array.isArray(baseline.violations)) {
      throw new Error('Unsupported or malformed baseline (expected version 1 and violations array).');
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

module.exports = { collectViolations, compareBaseline, violationKey };
