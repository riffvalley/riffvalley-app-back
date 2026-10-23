const SECRET_ASSIGNMENT_PATTERN =
  /((?:["']?)(?:access[_-]?token|refresh[_-]?token|ig_access_token|ig_heroku_api_token|api[_-]?key|client[_-]?secret|password|secret|authorization)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^&,\s}"']+)/gi;
const BEARER_TOKEN_PATTERN = /(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/gi;

export function sanitizeInstagramLogValue(
  value: string,
  secrets: readonly string[],
): string {
  let sanitized = value;

  for (const secret of secrets) {
    if (!secret) continue;

    sanitized = sanitized.split(secret).join('[REDACTED]');
    const encodedSecret = encodeURIComponent(secret);
    if (encodedSecret !== secret) {
      sanitized = sanitized.split(encodedSecret).join('[REDACTED]');
    }
  }

  return sanitized
    .replace(BEARER_TOKEN_PATTERN, '$1[REDACTED]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '$1[REDACTED]');
}

export function instagramErrorMessage(error: unknown): string {
  return error instanceof Error ? error.toString() : String(error);
}

export function instagramResponseDiagnostic(
  body: string,
  secrets: readonly string[],
): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return sanitizeInstagramLogValue(body, secrets).slice(0, 500);
  }

  if (!isRecord(parsed)) {
    return 'provider returned an error response';
  }

  const nestedError = parsed.error;
  const errorRecord = isRecord(nestedError) ? nestedError : undefined;
  const message =
    (typeof parsed.message === 'string' && parsed.message) ||
    (typeof errorRecord?.message === 'string' && errorRecord.message) ||
    (typeof nestedError === 'string' && nestedError) ||
    (typeof parsed.error_description === 'string' && parsed.error_description);
  const id = typeof parsed.id === 'string' ? parsed.id : undefined;
  const details = [message, id && `id=${id}`].filter(
    (detail): detail is string => typeof detail === 'string',
  );

  return details.length > 0
    ? sanitizeInstagramLogValue(details.join(' '), secrets).slice(0, 500)
    : 'provider returned an error response';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
