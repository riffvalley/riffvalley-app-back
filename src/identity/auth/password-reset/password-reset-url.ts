import { ServiceUnavailableException } from '@nestjs/common';

const RESET_PATH = '/reset-password';
const PRODUCTION_HOSTS = new Set(['app.riffvalley.es', 'beta.riffvalley.es']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createPasswordResetLink(
  configuredUrl: string | undefined,
  stage: string | undefined,
  token: string,
): string {
  if (!configuredUrl) throw unavailable();

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw unavailable();
  }

  const isProductionHost = PRODUCTION_HOSTS.has(url.hostname);
  const isLocalHost = LOCAL_HOSTS.has(url.hostname);
  const productionStage = stage?.toLowerCase() === 'prod';
  const validOrigin = productionStage
    ? isProductionHost && url.protocol === 'https:' && !url.port
    : isLocalHost && url.protocol === 'http:';
  if (
    url.username ||
    url.password ||
    url.pathname !== RESET_PATH ||
    url.search ||
    url.hash ||
    !validOrigin
  ) {
    throw unavailable();
  }

  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException('Password recovery is not available');
}
