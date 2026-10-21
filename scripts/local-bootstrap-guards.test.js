const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  LOCAL_BOOTSTRAP_TARGET,
  validateBootstrapEnvironment,
  validateDockerInspection,
  validateResetConfirmation,
} = require('./local-bootstrap-guards.ts');

const validEnvironment = {
  STAGE: 'dev',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'SpamMusicDB',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'local-only',
};

const validInspection = {
  name: '/spammusicdb',
  image: 'postgres:17',
  status: 'running',
  ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }] },
  networks: { bridge: { IPAddress: '172.17.0.2' } },
};

test('acepta solo el destino local confirmado', () => {
  assert.doesNotThrow(() => validateBootstrapEnvironment(validEnvironment));
  assert.deepEqual(validateDockerInspection(validInspection), ['172.17.0.2']);
  assert.doesNotThrow(() =>
    validateDockerInspection({
      ...validInspection,
      ports: {
        '5432/tcp': [
          { HostIp: '0.0.0.0', HostPort: '5432' },
          { HostIp: '::', HostPort: '5432' },
        ],
      },
    }),
  );
  assert.equal(LOCAL_BOOTSTRAP_TARGET.database, 'SpamMusicDB');
});

test('rechaza stage, host, base y DATABASE_URL ajenos', () => {
  for (const [name, value] of [
    ['STAGE', 'prod'],
    ['DB_HOST', 'db.example.com'],
    ['DB_NAME', 'production'],
    ['DATABASE_URL', 'postgres://remote/db'],
  ]) {
    assert.throws(() =>
      validateBootstrapEnvironment({ ...validEnvironment, [name]: value }),
    );
  }
});

test('rechaza contenedores, imágenes, estado o puertos diferentes', () => {
  for (const change of [
    { name: '/other' },
    { image: 'postgres:16' },
    { status: 'exited' },
    { ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5433' }] } },
    {
      ports: {
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }],
        '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }],
      },
    },
  ]) {
    assert.throws(() =>
      validateDockerInspection({ ...validInspection, ...change }),
    );
  }
});

test('exige confirmación exacta para reset', () => {
  assert.doesNotThrow(() =>
    validateResetConfirmation('REINICIAR SpamMusicDB', 'SpamMusicDB'),
  );
  assert.throws(() =>
    validateResetConfirmation('yes', 'SpamMusicDB'),
  );
});
