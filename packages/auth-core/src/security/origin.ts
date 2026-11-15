const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Browser state changes must come from this application's own origin.
 * Signed service calls are authenticated separately and are not browser requests.
 */
export function requestOriginAllowed(input: {
  method: string;
  appUrl: string;
  origin: string | null;
  referer: string | null;
  serviceRequest?: boolean;
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (input.serviceRequest) return true;
  const expected = originOf(input.appUrl);
  if (!expected) return false;
  const actual = originOf(input.origin) ?? originOf(input.referer);
  return actual === expected;
}
