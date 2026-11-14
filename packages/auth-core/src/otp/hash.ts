import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-only. Hashes a one-time code with the calling application's secret.
 * The secret must be that application's own AUTH_SECRET. Admin and Clinic
 * must not share a secret, and the raw code must not be stored.
 */
export function hashOtp(otp: string, secret: string): string {
  if (secret.trim().length === 0) {
    throw new Error("OTP hashing requires an application secret.");
  }

  return createHmac("sha256", secret).update(otp).digest("base64url");
}

export function otpHashesMatch(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
