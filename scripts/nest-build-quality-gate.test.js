const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BuildAction } = require('@nestjs/cli/actions/build.action');

class BuildExit extends Error {
  constructor(code) {
    super(`Nest build exited with status ${code}`);
    this.code = code;
  }
}

function createFixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-nest-build-'));
  fs.mkdirSync(path.join(projectRoot, 'src'));
  fs.symlinkSync(
    path.resolve(__dirname, '..', 'node_modules'),
    path.join(projectRoot, 'node_modules'),
    'dir',
  );
  const configName = `nest-cli-${path.basename(projectRoot)}.json`;
  fs.writeFileSync(
    path.join(projectRoot, configName),
    JSON.stringify({
      collection: '@nestjs/schematics',
      sourceRoot: 'src',
      compilerOptions: { deleteOutDir: true },
    }),
  );
  fs.writeFileSync(
    path.join(projectRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'ES2021',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        outDir: './dist',
        rootDir: './src',
        incremental: true,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  );

  return { projectRoot, configName };
}

async function runNestBuild(projectRoot, configName) {
  const originalCwd = process.cwd();
  const originalExit = process.exit;
  process.chdir(projectRoot);
  process.exit = (code) => {
    throw new BuildExit(code ?? 0);
  };

  try {
    const action = new BuildAction();
    await action.runBuild(
      [{ name: 'app', value: undefined }],
      [
        { name: 'config', value: configName },
        { name: 'path', value: 'tsconfig.json' },
        { name: 'builder', value: 'tsc' },
        { name: 'webpack', value: false },
      ],
      false,
      false,
    );
    return 0;
  } catch (error) {
    if (error instanceof BuildExit) return error.code;
    throw error;
  } finally {
    process.exit = originalExit;
    process.chdir(originalCwd);
  }
}

test('Nest build accepts a valid fixture and rejects a TypeScript compilation error', async () => {
  const { projectRoot, configName } = createFixture();
  const mainPath = path.join(projectRoot, 'src', 'main.ts');
  const originalError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args.join(' '));

  try {
    fs.writeFileSync(
      mainPath,
      "import { Module } from '@nestjs/common';\n@Module({}) export class AppModule {}\n",
    );
    assert.equal(await runNestBuild(projectRoot, configName), 0);
    assert.ok(fs.existsSync(path.join(projectRoot, 'dist', 'main.js')));

    fs.writeFileSync(
      mainPath,
      "import { Module } from '@nestjs/common';\n@Module({}) export class AppModule {}\nconst broken: number = 'not a number';\n",
    );
    assert.notEqual(await runNestBuild(projectRoot, configName), 0);
    assert.ok(diagnostics.some((message) => message.includes('Type')));
  } finally {
    console.error = originalError;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
