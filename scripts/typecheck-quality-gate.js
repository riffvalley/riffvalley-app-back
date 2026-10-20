#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function fingerprint(message) {
  return crypto
    .createHash('sha256')
    .update(message.replace(/\s+/g, ' ').trim())
    .digest('hex');
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectDiagnostics(configPath, repositoryRoot = path.dirname(configPath)) {
  const absoluteConfigPath = path.resolve(configPath);
  const configDirectory = path.dirname(absoluteConfigPath);
  const configFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
  if (configFile.error) {
    return [normalizeDiagnostic(configFile.error, repositoryRoot)];
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    configDirectory,
    { noEmit: true, incremental: false },
    absoluteConfigPath,
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  return [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
    .map((diagnostic) => normalizeDiagnostic(diagnostic, repositoryRoot))
    .sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
}

function normalizeDiagnostic(diagnostic, repositoryRoot) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const position =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined;

  return {
    code: diagnostic.code,
    path: diagnostic.file
      ? toPosixPath(path.relative(repositoryRoot, diagnostic.file.fileName))
      : '<config>',
    line: position ? position.line + 1 : 0,
    column: position ? position.character + 1 : 0,
    fingerprint: fingerprint(message),
  };
}

function diagnosticKey(diagnostic) {
  return [
    diagnostic.code,
    diagnostic.path,
    diagnostic.line,
    diagnostic.column,
    diagnostic.fingerprint,
  ].join(':');
}

function compareBaseline(diagnostics, baselineEntries) {
  const currentKeys = new Set(diagnostics.map(diagnosticKey));
  const baselineKeys = new Set();
  const duplicateEntries = [];

  for (const entry of baselineEntries) {
    const key = diagnosticKey(entry);
    if (baselineKeys.has(key)) duplicateEntries.push(entry);
    baselineKeys.add(key);
  }

  return {
    newDiagnostics: diagnostics.filter((entry) => !baselineKeys.has(diagnosticKey(entry))),
    staleEntries: baselineEntries.filter((entry) => !currentKeys.has(diagnosticKey(entry))),
    duplicateEntries,
  };
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const configPath = path.join(repositoryRoot, 'tsconfig.json');
  const baselinePath = path.join(__dirname, 'typecheck-quality-gate.baseline.json');

  try {
    let baselineEntries = [];
    if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      if (baseline.version !== 1 || !Array.isArray(baseline.diagnostics)) {
        throw new Error('Unsupported or malformed baseline (expected version 1 and diagnostics array).');
      }
      baselineEntries = baseline.diagnostics;
    }

    const diagnostics = collectDiagnostics(configPath, repositoryRoot);
    const comparison = compareBaseline(diagnostics, baselineEntries);
    console.log(
      `Typecheck gate (tsconfig.json): ${diagnostics.length} errors; ${comparison.newDiagnostics.length} new; ${comparison.staleEntries.length} stale; ${comparison.duplicateEntries.length} duplicate baseline entries.`,
    );

    for (const diagnostic of comparison.newDiagnostics) {
      console.error(`NEW TS${diagnostic.code}: ${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`);
    }
    for (const entry of comparison.staleEntries) {
      console.error(`STALE TS${entry.code}: ${entry.path}:${entry.line}:${entry.column}`);
    }
    for (const entry of comparison.duplicateEntries) {
      console.error(`DUPLICATE TS${entry.code}: ${entry.path}:${entry.line}:${entry.column}`);
    }

    if (
      comparison.newDiagnostics.length ||
      comparison.staleEntries.length ||
      comparison.duplicateEntries.length
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Typecheck gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { collectDiagnostics, compareBaseline, diagnosticKey };
