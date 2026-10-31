export type AuthRateLimitDimension = {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

/** Initial guardrails; tune with representative traffic before enabling sessions. */
export const AUTH_RATE_LIMIT_POLICY = {
  loginAccount: { limit: 5, windowSeconds: 15 * 60 },
  loginIp: { limit: 30, windowSeconds: 15 * 60 },
  passwordResetRequestEmail: { limit: 3, windowSeconds: 15 * 60 },
  passwordResetRequestIp: { limit: 10, windowSeconds: 15 * 60 },
  passwordResetAttemptIp: { limit: 10, windowSeconds: 15 * 60 },
  csrfBootstrapIp: { limit: 30, windowSeconds: 15 * 60 },
  refreshIp: { limit: 120, windowSeconds: 60 },
  refreshSession: { limit: 30, windowSeconds: 60 },
  logoutIp: { limit: 120, windowSeconds: 60 },
  logoutSession: { limit: 30, windowSeconds: 60 },
} as const;
