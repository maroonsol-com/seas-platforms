import { randomInt } from "node:crypto";

import { OTP_LENGTH } from "./constants";

/**
 * Server-only. Creates a numeric one-time code with a cryptographically
 * secure generator. This does not send email and does not store the code.
 */
export function generateOtpCode(): string {
  const upperBound = 10 ** OTP_LENGTH;
  return randomInt(0, upperBound).toString().padStart(OTP_LENGTH, "0");
}
