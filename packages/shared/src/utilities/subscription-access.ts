const OPEN_STATUSES = new Set(["trial", "active", "expiring_soon"]);

/** Calendar date in the subscription timezone, formatted YYYY-MM-DD. */
export function localDateIso(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Access lasts through the expiry date in the subscription timezone.
 * The next local day is restricted. Suspension, cancellation, and expiry
 * remove normal access immediately.
 */
export function subscriptionAccessAllowed(input: {
  status: string;
  expiresOn: string;
  timezone: string;
  now?: Date;
}): boolean {
  if (!OPEN_STATUSES.has(input.status)) {
    return false;
  }

  return input.expiresOn >= localDateIso(input.timezone, input.now);
}
