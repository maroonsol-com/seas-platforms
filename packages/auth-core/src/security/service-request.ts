import { createHmac } from "node:crypto";

import { safeEqual } from "../utilities";

export const SERVICE_SIGNATURE_HEADER = "x-saas-signature";
export const SERVICE_TIMESTAMP_HEADER = "x-saas-timestamp";

const MAX_SKEW_MS = 5 * 60 * 1000;

/** Signs a raw request body. The secret stays in the server environment. */
export function signServiceRequest(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
}

export function verifyServiceRequest(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  now?: number;
}): boolean {
  if (input.secret.trim().length === 0 || input.timestamp.length === 0 || input.signature.length === 0) {
    return false;
  }

  const sentAt = Date.parse(input.timestamp);
  if (!Number.isFinite(sentAt)) {
    return false;
  }

  const now = input.now ?? Date.now();
  if (Math.abs(now - sentAt) > MAX_SKEW_MS) {
    return false;
  }

  return safeEqual(signServiceRequest(input.secret, input.timestamp, input.body), input.signature);
}
