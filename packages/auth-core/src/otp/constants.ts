export const OTP_LENGTH = 6;

/** One-time codes expire after five minutes. */
export const OTP_TTL_MS = 5 * 60 * 1000;

export const OTP_MAX_ATTEMPTS = 5;

/** Minimum wait before another code can be requested for the same email. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
