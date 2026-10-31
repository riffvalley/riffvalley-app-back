import { randomBytes, randomUUID } from 'node:crypto';
import {
  derivePasswordResetToken,
  hashPasswordResetToken,
} from '../password-reset.service';
import { isPasswordValid } from '../../passwords/password-policy';
import { AUTH_RATE_LIMIT_POLICY } from '../../rate-limiting/auth-rate-limit-policy';

describe('password reset token protocol', () => {
  it('derives a stable 256-bit base64url token from the ID and dedicated key', () => {
    const requestId = randomUUID();
    const secret = randomBytes(32);
    const token = derivePasswordResetToken(requestId, secret);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(derivePasswordResetToken(requestId, secret)).toBe(token);
    expect(derivePasswordResetToken(requestId, randomBytes(32))).not.toBe(
      token,
    );
    expect(hashPasswordResetToken(token)).toHaveLength(32);
    expect(hashPasswordResetToken(token).toString('base64url')).not.toBe(token);
  });

  it('accepts exactly the password policy shared by account DTOs', () => {
    expect(isPasswordValid('Password1')).toBe(true);
    expect(isPasswordValid('pass1')).toBe(false);
    expect(isPasswordValid('PASSWORD1')).toBe(false);
    expect(isPasswordValid('Password'.repeat(7))).toBe(false);
  });

  it('defines the approved distributed request and reset windows', () => {
    expect(AUTH_RATE_LIMIT_POLICY.passwordResetRequestEmail).toEqual({
      limit: 3,
      windowSeconds: 900,
    });
    expect(AUTH_RATE_LIMIT_POLICY.passwordResetRequestIp).toEqual({
      limit: 10,
      windowSeconds: 900,
    });
    expect(AUTH_RATE_LIMIT_POLICY.passwordResetAttemptIp).toEqual({
      limit: 10,
      windowSeconds: 900,
    });
  });
});
